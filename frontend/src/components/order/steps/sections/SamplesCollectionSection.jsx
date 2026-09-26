import React from "react";
import { FormattedMessage } from "react-intl";
import { Tile, Button, Stack } from "@carbon/react";
import { Add } from "@carbon/icons-react";
import SampleCollectionCard from "./SampleCollectionCard";
import { sampleObject } from "../../OrderContext";

/**
 * SamplesCollectionSection - Container for all sample collection cards
 *
 * Features:
 * - Displays all samples with collection details
 * - Add new sample button
 * - Print more labels button
 * - Auto-populates received date/time from server
 */

const SamplesCollectionSection = ({
  samples,
  setSamples,
  sampleTypes,
  unitOfMeasures,
  updateSampleCollectionDetails,
  serverClock,
  refreshServerClock,
  clockLoading,
  receiptMode = "now",
  isReadOnly,
}) => {
  // Handle sample update
  const handleSampleUpdate = (sampleIndex, updates) => {
    updateSampleCollectionDetails(sampleIndex, updates);
  };

  // Handle sample removal
  const handleSampleRemove = (sampleIndex) => {
    if (samples.length <= 1) return; // Keep at least one sample
    const updated = samples.filter((_, i) => i !== sampleIndex);
    // Re-index remaining samples
    const reindexed = updated.map((s, i) => ({ ...s, index: i }));
    setSamples(reindexed);
  };

  // Handle add new sample
  const handleAddSample = async () => {
    const currentClock = await refreshServerClock();
    if (currentClock) {
      const newSample = {
        ...sampleObject,
        collectionDate: currentClock.date,
        collectionTime: currentClock.time,
        receivedDate: receiptMode === "now" ? currentClock.date : "",
        receivedTime: receiptMode === "now" ? currentClock.time : "",
      };
      setSamples((currentSamples) => [
        ...currentSamples,
        { ...newSample, index: currentSamples.length },
      ]);
    }
  };

  return (
    <Tile className="order-section samples-collection-section">
      <h4 className="section-title">
        <FormattedMessage id="collect.samples.title" defaultMessage="Samples" />
      </h4>

      <Stack gap={5}>
        {/* Sample Cards */}
        {samples.map((sample, index) => (
          <SampleCollectionCard
            key={index}
            sample={sample}
            sampleIndex={index}
            sampleTypes={sampleTypes}
            unitOfMeasures={unitOfMeasures}
            serverClock={serverClock}
            receiptMode={receiptMode}
            onUpdate={handleSampleUpdate}
            onRemove={handleSampleRemove}
            isReadOnly={isReadOnly}
            canRemove={samples.length > 1}
          />
        ))}

        {/* Action Buttons */}
        <div className="sample-action-buttons">
          <Button
            kind="tertiary"
            size="md"
            renderIcon={Add}
            onClick={handleAddSample}
            disabled={isReadOnly || !serverClock || clockLoading}
          >
            <FormattedMessage
              id="collect.addSample.button"
              defaultMessage="+ Add Another Sample"
            />
          </Button>
        </div>

        <p className="helper-text">
          <FormattedMessage
            id="collect.sample.labelsAfterSave"
            defaultMessage="Save collection first, then print the physical tube label on the next page."
          />
        </p>
      </Stack>
    </Tile>
  );
};

export default SamplesCollectionSection;
