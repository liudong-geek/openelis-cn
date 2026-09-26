package org.openelisglobal.sample.dao;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import org.hibernate.Session;
import org.springframework.stereotype.Repository;

/** Bounded identity search only; no patient or clinical details are loaded here. */
@Repository
public class SpecimenLookupCandidateDAO {
    private static final int MAX_TUBE_ROWS = 500;

    @PersistenceContext
    private EntityManager entityManager;

    public record Candidate(String sampleId, String labNo, String domain, String sampleItemId, String sortOrder) {
        public boolean specimen() {
            return sampleItemId != null;
        }
    }

    public record Candidates(List<Candidate> matches, boolean overflow) {
    }

    public Candidates exactMatches(String code) {
        Session session = entityManager.unwrap(Session.class);
        List<Candidate> result = new ArrayList<>();
        List<Object[]> orders = session
                .createQuery("select s.id, s.accessionNumber, s.domain from Sample s where s.accessionNumber = :code",
                        Object[].class)
                .setParameter("code", code).setMaxResults(3).setTimeout(15).list();
        for (Object[] row : orders) {
            result.add(new Candidate((String) row[0], (String) row[1], (String) row[2], null, null));
        }
        if (result.size() > 1) {
            return new Candidates(List.copyOf(result), false);
        }

        // Dot prefixes are bounded indexed retrieval keys, never proof of a tube.
        var prefixes = new LinkedHashSet<String>();
        for (int dot = code.indexOf('.'); dot >= 0; dot = code.indexOf('.', dot + 1)) {
            String suffix = code.substring(dot + 1);
            if (suffix.matches("[1-9][0-9]{0,4}")) {
                prefixes.add(code.substring(0, dot));
            }
        }
        if (!prefixes.isEmpty()) {
            List<Object[]> tubes = session.createQuery(
                    "select si.id, si.sample.id, si.sample.accessionNumber, si.sample.domain, si.sortOrder"
                            + " from SampleItem si where si.sample.accessionNumber in (:prefixes)",
                    Object[].class).setParameter("prefixes", prefixes).setMaxResults(MAX_TUBE_ROWS + 1)
                    .setTimeout(15).list();
            if (tubes.size() > MAX_TUBE_ROWS) {
                return new Candidates(List.of(), true);
            }
            for (Object[] row : tubes) {
                String labNo = (String) row[2];
                String sortOrder = (String) row[4];
                if (labNo != null && sortOrder != null && sortOrder.matches("[1-9][0-9]{0,4}")
                        && code.equals(labNo + "." + sortOrder)) {
                    result.add(new Candidate((String) row[1], labNo, (String) row[3], (String) row[0], sortOrder));
                }
            }
        }
        return new Candidates(List.copyOf(result), false);
    }
}
