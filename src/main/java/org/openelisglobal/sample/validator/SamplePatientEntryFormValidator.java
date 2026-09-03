package org.openelisglobal.sample.validator;

import java.util.Iterator;
import org.apache.commons.validator.GenericValidator;
import org.dom4j.Document;
import org.dom4j.DocumentException;
import org.dom4j.DocumentHelper;
import org.dom4j.Element;
import org.openelisglobal.common.util.validator.CustomDateValidator.DateRelation;
import org.openelisglobal.common.util.DateUtil;
import org.openelisglobal.common.validator.ValidationHelper;
import org.openelisglobal.sample.form.SamplePatientEntryForm;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.validation.Errors;
import org.springframework.validation.Validator;

@Component
public class SamplePatientEntryFormValidator implements Validator {

    @Autowired
    RequesterMasterDataValidator requesterMasterDataValidator;

    @Override
    public boolean supports(Class<?> clazz) {
        return SamplePatientEntryForm.class.isAssignableFrom(clazz);
    }

    @Override
    public void validate(Object target, Errors errors) {
        SamplePatientEntryForm form = (SamplePatientEntryForm) target;

        // sampleXML
        if (!GenericValidator.isBlankOrNull(form.getSampleXML())) {
            validateSampleXML(form.getSampleXML(), errors);
        }

        int errorsBeforeRequesterValidation = errors.getErrorCount();
        requesterMasterDataValidator.validate(form.getSampleOrderItems(), errors);
        if (errors.getErrorCount() == errorsBeforeRequesterValidation) {
            requesterMasterDataValidator.applyCanonicalValues(form.getSampleOrderItems());
        }
    }

    private void validateSampleXML(String sampleXML, Errors errors) {
        try {
            Document sampleDom = DocumentHelper.parseText(sampleXML);
            for (Iterator<Element> iter = sampleDom.getRootElement().elementIterator("sample"); iter.hasNext();) {
                Element sampleItem = iter.next();
                validateSampleItem(sampleItem, errors);
                if (errors.hasErrors()) {
                    return;
                }
            }
        } catch (DocumentException e) {
            errors.reject("batchentry.error.sampleXML.invalid");
        }
    }

    private void validateSampleItem(Element sampleItem, Errors errors) {
        // validate test ids
        String[] testIDs = sampleItem.attributeValue("tests").split(",");
        for (int j = 0; j < testIDs.length; ++j) {
            ValidationHelper.validateIdField(testIDs[j], "sampleXML", "sampleXML tests", errors, false);
            if (errors.hasErrors()) {
                return;
            }
        } // validate panel ids
        String[] panelIDs = sampleItem.attributeValue("panels").split(",");
        for (int j = 0; j < panelIDs.length; ++j) {
            ValidationHelper.validateIdField(panelIDs[j], "sampleXML", "sampleXML panels", errors, false);
            if (errors.hasErrors()) {
                return;
            }
        }
        // validate date not required
        String collectionDate = sampleItem.attributeValue("date").trim();
        ValidationHelper.validateDateField(collectionDate, "sampleXML", "sampleXML date", errors, DateRelation.PAST,
                false);
        if (errors.hasErrors()) {
            return;
        }

        // validate time
        String collectionTime = sampleItem.attributeValue("time").trim();
        ValidationHelper.validateTimeField(collectionTime, "sampleXML", "sampleXML time", errors, false);
        if (errors.hasErrors()) {
            return;
        }

        // The date validator compares calendar days only.  Validate the combined
        // timestamp as well so an operator cannot record a specimen collection in
        // the future on today's date.
        if (!GenericValidator.isBlankOrNull(collectionDate)
                && !GenericValidator.isBlankOrNull(collectionTime)) {
            java.sql.Timestamp collectionTimestamp = DateUtil
                    .convertStringDateStringTimeToTimestamp(collectionDate, collectionTime);
            if (collectionTimestamp != null && collectionTimestamp.after(DateUtil.getNowAsTimestamp())) {
                errors.rejectValue("sampleXML", "error.sample.collection.future", null,
                        "Collection date and time cannot be in the future");
                return;
            }
        }

        // validate sample id
        String sampleId = sampleItem.attributeValue("sampleID");
        ValidationHelper.validateIdField(sampleId, "sampleXML", "sampleXML sampleID", errors, true);
    }
}
