import React, { useState, useEffect, useContext, useCallback } from "react";
import {
  Modal,
  TextInput,
  Dropdown,
  NumberInput,
  TextArea,
  Stack,
} from "@carbon/react";
import { FormattedMessage, useIntl } from "react-intl";
import { NotificationContext } from "../layout/Layout";
import { NotificationKinds } from "../common/CustomNotification";
import { InventoryItemAPI } from "./InventoryService";

const InventoryItemForm = ({ open, onClose, onSave, item = null }) => {
  const intl = useIntl();
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);
  const notify = useCallback(
    ({ kind, title, subtitle }) => {
      setNotificationVisible(true);
      addNotification({
        kind,
        title,
        subtitle,
      });
    },
    [addNotification, setNotificationVisible],
  );
  const isEdit = !!item;

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    itemType: "REAGENT",
    category: "",
    manufacturer: "",
    units: "",
    lowStockThreshold: 0,
    stabilityAfterOpening: 0,
    storageRequirements: "",
    compatibleAnalyzers: "",
    testsPerKit: 0,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [itemTypes, setItemTypes] = useState([]);

  // Load item types from backend
  useEffect(() => {
    const loadItemTypes = async () => {
      try {
        const types = await InventoryItemAPI.getItemTypes();
        const formattedTypes = types.map((type) => ({
          id: type,
          text: getItemTypeLabel(type),
        }));
        setItemTypes(formattedTypes);
      } catch (err) {
        console.error("Error loading item types:", err);
        notify({
          kind: NotificationKinds.error,
          title: intl.formatMessage({ id: "notification.error" }),
          subtitle: intl.formatMessage({ id: "catalog.item.types.load.error" }),
        });
      }
    };
    loadItemTypes();
  }, [notify, intl]);

  const getItemTypeLabel = (type) => {
    return intl.formatMessage({
      id: `inventory.itemType.${type}`,
      defaultMessage: type,
    });
  };

  // Load item data if editing, reset if adding new
  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name || "",
        itemType: item.itemType || "REAGENT",
        category: item.category || "",
        manufacturer: item.manufacturer || "",
        units: item.units || "",
        lowStockThreshold: item.lowStockThreshold || 0,
        stabilityAfterOpening: item.stabilityAfterOpening || 0,
        storageRequirements: item.storageRequirements || "",
        compatibleAnalyzers: item.compatibleAnalyzers || "",
        testsPerKit: item.testsPerKit || 0,
      });
    } else {
      // Reset to initial state when adding new item
      setFormData({
        name: "",
        itemType: "REAGENT",
        category: "",
        manufacturer: "",
        units: "",
        lowStockThreshold: 0,
        stabilityAfterOpening: 0,
        storageRequirements: "",
        compatibleAnalyzers: "",
        testsPerKit: 0,
      });
    }
  }, [item, open]);

  // Handle input changes
  const handleChange = (field, value) => {
    // Convert empty string or NaN to 0 for numeric fields
    const numericFields = [
      "lowStockThreshold",
      "stabilityAfterOpening",
      "testsPerKit",
    ];

    let processedValue = value;
    if (numericFields.includes(field)) {
      if (value === "" || value === null || value === undefined) {
        processedValue = 0;
      } else if (isNaN(value)) {
        processedValue = 0;
      }
    }

    setFormData((prev) => {
      // Prevent unnecessary state updates if value hasn't changed
      if (prev[field] === processedValue) {
        return prev;
      }
      return { ...prev, [field]: processedValue };
    });
    setError(null);
  };

  // Validate form
  const validate = () => {
    if (!formData.name?.trim()) {
      setError(intl.formatMessage({ id: "catalog.item.validation.name" }));
      return false;
    }

    if (!formData.itemType) {
      setError(intl.formatMessage({ id: "catalog.item.validation.type" }));
      return false;
    }

    // Type-specific validation
    if (formData.itemType === "REAGENT" && !formData.stabilityAfterOpening) {
      setError(intl.formatMessage({ id: "catalog.item.validation.stability" }));
      return false;
    }

    if (
      formData.itemType === "CARTRIDGE" &&
      !formData.compatibleAnalyzers?.trim()
    ) {
      setError(intl.formatMessage({ id: "catalog.item.validation.analyzers" }));
      return false;
    }

    if (formData.itemType === "RDT" && !formData.testsPerKit) {
      setError(
        intl.formatMessage({ id: "catalog.item.validation.testsPerKit" }),
      );
      return false;
    }

    return true;
  };

  // Handle save
  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    setError(null);

    try {
      // Build sanitized data with only type-relevant fields
      const sanitizedData = {
        name: formData.name,
        itemType: formData.itemType,
        category: formData.category,
        manufacturer: formData.manufacturer,
        units: formData.units,
        lowStockThreshold: Number(formData.lowStockThreshold) || 0,
      };

      // Add type-specific fields only for relevant item types
      if (formData.itemType === "REAGENT") {
        sanitizedData.stabilityAfterOpening =
          Number(formData.stabilityAfterOpening) || 0;
        sanitizedData.storageRequirements = formData.storageRequirements;
      } else if (formData.itemType === "CARTRIDGE") {
        sanitizedData.compatibleAnalyzers = formData.compatibleAnalyzers;
      } else if (formData.itemType === "RDT") {
        sanitizedData.testsPerKit = Number(formData.testsPerKit) || 0;
      }

      if (isEdit) {
        await InventoryItemAPI.update(item.id, sanitizedData);
      } else {
        await InventoryItemAPI.create(sanitizedData);
      }
      setSaving(false);
      onSave();
    } catch (err) {
      console.error("Error saving item:", err);
      const errorMessage = intl.formatMessage({
        id: "catalog.item.save.error",
      });
      setError(errorMessage);
      setSaving(false);
      notify({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.error" }),
        subtitle: errorMessage,
      });
    }
  };

  return (
    <Modal
      open={open}
      onRequestClose={onClose}
      onRequestSubmit={handleSave}
      modalHeading={intl.formatMessage({
        id: isEdit
          ? "catalog.item.form.title.edit"
          : "catalog.item.form.title.add",
      })}
      primaryButtonText={intl.formatMessage({ id: "button.save" })}
      secondaryButtonText={intl.formatMessage({ id: "button.cancel" })}
      primaryButtonDisabled={saving}
      size="md"
    >
      <Stack gap={5}>
        {error && (
          <div style={{ color: "red", marginBottom: "1rem" }}>{error}</div>
        )}

        <TextInput
          id="name"
          labelText={<FormattedMessage id="catalog.item.name" />}
          value={formData.name}
          onChange={(e) => handleChange("name", e.target.value)}
          required
        />

        <Dropdown
          id="itemType"
          titleText={<FormattedMessage id="catalog.item.type" />}
          label={intl.formatMessage({ id: "catalog.item.type.select" })}
          items={itemTypes}
          itemToString={(item) => (item ? item.text : "")}
          selectedItem={itemTypes.find((t) => t.id === formData.itemType)}
          onChange={({ selectedItem }) =>
            handleChange("itemType", selectedItem.id)
          }
          required
        />

        <TextInput
          id="category"
          labelText={<FormattedMessage id="catalog.item.category" />}
          value={formData.category}
          onChange={(e) => handleChange("category", e.target.value)}
        />

        <TextInput
          id="manufacturer"
          labelText={<FormattedMessage id="catalog.item.manufacturer" />}
          value={formData.manufacturer}
          onChange={(e) => handleChange("manufacturer", e.target.value)}
        />

        <TextInput
          id="units"
          labelText={<FormattedMessage id="catalog.item.units" />}
          value={formData.units}
          onChange={(e) => handleChange("units", e.target.value)}
          placeholder={intl.formatMessage({
            id: "catalog.item.units.placeholder",
          })}
        />

        <NumberInput
          id="lowStockThreshold"
          label={<FormattedMessage id="catalog.item.lowStockThreshold" />}
          value={formData.lowStockThreshold ?? 0}
          onChange={(e, { value }) =>
            handleChange("lowStockThreshold", value ?? 0)
          }
          min={0}
          max={999999}
        />

        {/* Type-specific fields */}
        {formData.itemType === "REAGENT" && (
          <>
            <NumberInput
              id="stabilityAfterOpening"
              label={
                <FormattedMessage id="catalog.item.stabilityAfterOpening" />
              }
              value={formData.stabilityAfterOpening ?? 0}
              onChange={(e, { value }) =>
                handleChange("stabilityAfterOpening", value ?? 0)
              }
              min={0}
              max={365}
              required
            />

            <TextArea
              id="storageRequirements"
              labelText={
                <FormattedMessage id="catalog.item.storageRequirements" />
              }
              value={formData.storageRequirements}
              onChange={(e) =>
                handleChange("storageRequirements", e.target.value)
              }
              placeholder={intl.formatMessage({
                id: "catalog.item.storageRequirements.placeholder",
              })}
            />
          </>
        )}

        {formData.itemType === "CARTRIDGE" && (
          <TextInput
            id="compatibleAnalyzers"
            labelText={
              <FormattedMessage id="catalog.item.compatibleAnalyzers" />
            }
            value={formData.compatibleAnalyzers}
            onChange={(e) =>
              handleChange("compatibleAnalyzers", e.target.value)
            }
            placeholder={intl.formatMessage({
              id: "catalog.item.compatibleAnalyzers.placeholder",
            })}
            required
          />
        )}

        {formData.itemType === "RDT" && (
          <NumberInput
            id="testsPerKit"
            label={<FormattedMessage id="catalog.item.testsPerKit" />}
            value={formData.testsPerKit ?? 0}
            onChange={(e, { value }) => handleChange("testsPerKit", value ?? 0)}
            min={1}
            max={1000}
            required
          />
        )}
      </Stack>
    </Modal>
  );
};

export default InventoryItemForm;
