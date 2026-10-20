package org.openelisglobal.analyzer.service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import org.openelisglobal.common.log.LogEvent;
import org.openelisglobal.qc.dao.QCControlLotDAO;
import org.openelisglobal.qc.service.QCResultService;
import org.openelisglobal.qc.valueholder.QCControlLot;
import org.openelisglobal.qc.valueholder.QCResult;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Processes QC results received via the FHIR import pipeline.
 *
 * <p>
 * Resolves the {@link QCControlLot} within the test and instrument. An explicit
 * lot number and its supplied control level must identify exactly one usable
 * entry. An unresolved explicit identity never falls back to another lot.
 * Legacy accession matching and sole-usable-lot matching remain available when
 * no conflicting identity is supplied.
 *
 * <p>
 * If a matching lot is found, delegates to
 * {@link QCResultService#createQCResult} which persists the result, calculates
 * the z-score, and publishes a {@code QCResultCreatedEvent} for async Westgard
 * rule evaluation.
 *
 * <p>
 * If no matching lot is found (unavailable, conflicting or ambiguous identity),
 * returns a NOT_PROCESSED receipt. Persistence failures cross the transaction
 * boundary so the caller cannot report success before commit.
 */
@Service
@Transactional
public class QCResultProcessingServiceImpl implements QCResultProcessingService {

    private static final String CLASS_NAME = "QCResultProcessingServiceImpl";

    @Autowired
    private QCResultService qcResultService;

    @Autowired
    private QCControlLotDAO controlLotDAO;

    @Override
    @Transactional(propagation = Propagation.REQUIRED)
    public QCProcessingResult processQCResult(String analyzerId, String testId, String accessionNumber,
            String lotNumber, String controlLevel, BigDecimal resultValue, String unit, LocalDateTime timestamp) {

        if (testId == null || testId.isBlank() || analyzerId == null || analyzerId.isBlank() || accessionNumber == null
                || accessionNumber.isBlank() || resultValue == null || timestamp == null) {
            LogEvent.logWarn(CLASS_NAME, "processQCResult", "Skipping QC processing — missing required field: testId="
                    + testId + " analyzerId=" + analyzerId + " accession=" + accessionNumber);
            return QCProcessingResult.notProcessed("QC_REQUIRED_FIELD_MISSING");
        }

        // analyzerId and testId are already String — they match the
        // String-typed instrumentId/testId on QCControlLot (bridged to
        // NUMERIC SQL via LIMSStringNumberUserType). No parsing needed.
        QCControlLot lot = findMatchingControlLot(accessionNumber, lotNumber, controlLevel, testId, analyzerId);
        if (lot == null) {
            LogEvent.logError(CLASS_NAME, "processQCResult",
                    "No matching QC control lot for accession=" + accessionNumber + " lotNumber=" + lotNumber
                            + " controlLevel=" + controlLevel + " testId=" + testId + " instrumentId=" + analyzerId
                            + " — verify the lot identity, level and status for this test+instrument");
            return QCProcessingResult.notProcessed("QC_CONTROL_LOT_NOT_RESOLVED");
        }

        QCResult created = qcResultService.createQCResult(analyzerId, testId, lot.getId(), lot.getControlLevel(),
                resultValue, unit, timestamp);
        return QCProcessingResult.created(created != null ? created.getId() : null);
    }

    /**
     * Match explicit lot numbers before legacy accession-as-lot identifiers. A
     * supplied level is part of the identity within that lot number. Duplicate
     * identities are rejected before checking status. ACTIVE and ESTABLISHMENT
     * retain their existing usable status.
     *
     * <p>
     * If neither lot identifier applies, a supplied level must match exactly one
     * usable lot. Only when no level is supplied may a single usable lot be
     * selected without an identifier.
     */
    private QCControlLot findMatchingControlLot(String accessionNumber, String lotNumber, String controlLevel,
            String testId, String instrumentId) {
        List<QCControlLot> lots = controlLotDAO.getByTestAndInstrument(testId, instrumentId);

        // Explicit identifiers are exact and binding, including unknown values.
        if (lotNumber != null && !lotNumber.isEmpty()) {
            List<QCControlLot> matches = lots.stream().filter(l -> lotNumber.equals(l.getLotNumber())).toList();
            return resolveWithinLot(matches, controlLevel);
        }
        // Legacy instruments may encode the lot number in the specimen accession.
        List<QCControlLot> accessionMatches = lots.stream().filter(l -> accessionNumber.equals(l.getLotNumber()))
                .toList();
        if (!accessionMatches.isEmpty()) {
            return resolveWithinLot(accessionMatches, controlLevel);
        }

        // A supplied level is also binding; neither zero nor multiple matches resolve.
        if (controlLevel != null && !controlLevel.trim().isEmpty()) {
            String trimmedLevel = controlLevel.trim();
            List<QCControlLot> levelMatches = lots.stream()
                    .filter(l -> isUsable(l) && trimmedLevel.equalsIgnoreCase(l.getControlLevel())).toList();
            if (levelMatches.size() == 1) {
                QCControlLot match = levelMatches.get(0);
                LogEvent.logInfo(CLASS_NAME, "findMatchingControlLot",
                        "Tier 2: level match controlLevel='" + trimmedLevel + "' → lot '" + match.getLotNumber()
                                + "' for testId=" + testId + " instrumentId=" + instrumentId);
                return match;
            }
            if (levelMatches.size() > 1) {
                String matchedLotNumbers = levelMatches.stream().map(QCControlLot::getLotNumber)
                        .reduce((a, b) -> a + ", " + b).orElse("");
                LogEvent.logWarn(CLASS_NAME, "findMatchingControlLot",
                        "Tier 2: ambiguous level match controlLevel='" + trimmedLevel + "' for testId=" + testId
                                + " instrumentId=" + instrumentId + " — " + levelMatches.size()
                                + " usable lots share this level [" + matchedLotNumbers
                                + "]; cannot disambiguate, returning null.");
            }
            return null;
        }

        // Compatibility fallback requires exactly one usable lot and no supplied
        // identity.
        List<QCControlLot> usableLots = lots.stream().filter(QCResultProcessingServiceImpl::isUsable).toList();
        if (usableLots.size() == 1) {
            LogEvent.logInfo(CLASS_NAME, "findMatchingControlLot",
                    "Single-usable-lot fallback — using '" + usableLots.get(0).getLotNumber() + "' for accession="
                            + accessionNumber + " testId=" + testId + " instrumentId=" + instrumentId);
            return usableLots.get(0);
        }

        if (usableLots.size() > 1) {
            LogEvent.logWarn(CLASS_NAME, "findMatchingControlLot",
                    "Multiple usable lots for testId=" + testId + " instrumentId=" + instrumentId + " (count="
                            + usableLots.size() + "); bridge did not propagate lotNumber/"
                            + "controlLevel — cannot disambiguate.");
        }

        return null;
    }

    private QCControlLot resolveWithinLot(List<QCControlLot> sameLot, String controlLevel) {
        // Different levels may share one lot number. Availability cannot resolve
        // duplicate entries with the same lot and level, even if one is inactive.
        List<QCControlLot> identity = sameLot.stream().filter(lot -> matchesLevel(lot, controlLevel)).toList();
        return identity.size() == 1 && isUsable(identity.get(0)) ? identity.get(0) : null;
    }

    private static boolean matchesLevel(QCControlLot lot, String controlLevel) {
        return controlLevel == null || controlLevel.isBlank()
                || controlLevel.trim().equalsIgnoreCase(lot.getControlLevel());
    }

    private static boolean isUsable(QCControlLot lot) {
        String status = lot.getStatus();
        return "ACTIVE".equals(status) || "ESTABLISHMENT".equals(status);
    }
}
