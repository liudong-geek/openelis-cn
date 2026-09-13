package org.openelisglobal.qachecklist.dao;

/** Loads current persisted intake facts without trusting any saved QA flag. */
public interface QaChecklistPrerequisiteDAO {
    Prerequisites findPrerequisites(Integer sampleId);

    record Prerequisites(boolean registered, boolean collected, boolean stored, boolean disposed, boolean rejected,
            boolean statusConflict, boolean noActiveTests) {
    }
}
