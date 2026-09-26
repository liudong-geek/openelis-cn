import React from "react";
import { FormattedMessage } from "react-intl";
import { Tile, Button, Stack } from "@carbon/react";
import { Add, Printer } from "@carbon/icons-react";
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

  // Handle print labels for a specific sample
  const handlePrintLabels = (sampleIndex) => {
    // TODO: Implement label printing
  };

  // Handle add new sample
  const handleAddSample = async () => {
    const currentClock = await refreshServerClock();
    if (currentClock) {
      const newSample = {
        ...sampleObject,
        collectionDate: currentClock.date,
        collectionTime: currentClock.time,
        receivedDate: currentClock.date,
        receivedTime: currentClock.time,
      };
      setSamples((currentSamples) => [
        ...currentSamples,
        { ...newSample, index: currentSamples.length },
      ]);
    }
  };

  // Handle print more sample labels
  const handlePrintMoreLabels = () => {
    // TODO: Implement printing additional labels
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
            onUpdate={handleSampleUpdate}
            onRemove={handleSampleRemove}
            onPrintLabels={handlePrintLabels}
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

          <Button
            kind="tertiary"
            size="md"
            renderIcon={Printer}
            onClick={handlePrintMoreLabels}
            disabled={isReadOnly}
          >
            <FormattedMessage
              id="collect.printMoreLabels.button"
              defaultMessage="Print More Sample Labels"
            />
          </Button>
        </div>

        <p className="helper-text">
          <FormattedMessage
            id="collect.printMoreLabels.helper"
            defaultMessage="Use 'Print More Sample Labels' if you draw more than expected or need labels for a different sample type."
          />
        </p>
      </Stack>
    </Tile>
  );
};

export default SamplesCollectionSection;
