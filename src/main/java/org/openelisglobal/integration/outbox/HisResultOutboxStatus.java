package org.openelisglobal.integration.outbox;

public enum HisResultOutboxStatus {
  PENDING,
  FAILED,
  ACKNOWLEDGED,
  DEAD_LETTER,
  CLOSED
}
