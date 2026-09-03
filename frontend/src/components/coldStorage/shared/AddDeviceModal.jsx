import React, { useState, useEffect } from "react";
import {
  Modal,
  Form,
  Stack,
  TextInput,
  Select,
  SelectItem,
  Button,
  FormLabel,
  NumberInput,
} from "@carbon/react";
import { Add } from "@carbon/icons-react";
import { useIntl } from "react-intl";

const getDeviceTypeOptions = (intl) => [
  {
    value: "freezer",
    label: intl.formatMessage({ id: "coldStorage.device.type.freezer" }),
  },
  {
    value: "refrigerator",
    label: intl.formatMessage({ id: "coldStorage.device.type.refrigerator" }),
  },
  {
    value: "cabinet",
    label: intl.formatMessage({ id: "coldStorage.device.type.cabinet" }),
  },
  {
    value: "other",
    label: intl.formatMessage({ id: "coldStorage.device.type.other" }),
  },
];

const PROTOCOL_OPTIONS = [
  { value: "TCP", label: "Modbus TCP" },
  { value: "RTU", label: "Modbus RTU" },
];

const getParityOptions = (intl) => [
  {
    value: "NONE",
    label: intl.formatMessage({ id: "coldStorage.deviceForm.parity.none" }),
  },
  {
    value: "EVEN",
    label: intl.formatMessage({ id: "coldStorage.deviceForm.parity.even" }),
  },
  {
    value: "ODD",
    label: intl.formatMessage({ id: "coldStorage.deviceForm.parity.odd" }),
  },
  {
    value: "MARK",
    label: intl.formatMessage({ id: "coldStorage.deviceForm.parity.mark" }),
  },
  {
    value: "SPACE",
    label: intl.formatMessage({ id: "coldStorage.deviceForm.parity.space" }),
  },
];

const INITIAL_FORM_DATA = {
  name: "",
  deviceType: "freezer",
  roomId: "",
  protocol: "TCP",
  host: "",
  port: 502,
  serialPort: "",
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: "NONE",
  slaveId: 1,
  temperatureRegister: 0,
  temperatureScale: 1.0,
  temperatureOffset: 0.0,
  humidityRegister: 0,
  humidityScale: 1.0,
  humidityOffset: 0.0,
};

export default function AddDeviceModal({
  isOpen,
  onClose,
  onSubmit,
  locations = [],
  onAddRoom,
  editingDevice = null,
}) {
  const intl = useIntl();
  const deviceTypeOptions = getDeviceTypeOptions(intl);
  const parityOptions = getParityOptions(intl);
  const translateNumberInput = (messageId) =>
    intl.formatMessage({
      id:
        messageId === "increment.number"
          ? "carbon.increment.number"
          : "carbon.decrement.number",
    });
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);

  useEffect(() => {
    if (editingDevice) {
      setFormData({
        ...INITIAL_FORM_DATA,
        ...editingDevice,
      });
    } else {
      setFormData(INITIAL_FORM_DATA);
    }
  }, [editingDevice, isOpen]);

  const handleFormChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    onSubmit(formData);
  };

  const isValid =
    formData.name &&
    formData.roomId &&
    formData.roomId !== "" &&
    (formData.protocol === "TCP" ? formData.host : formData.serialPort);

  return (
    <>
      <Modal
        open={isOpen}
        onRequestClose={onClose}
        onRequestSubmit={handleSubmit}
        closeButtonLabel={intl.formatMessage({ id: "button.close" })}
        modalHeading={intl.formatMessage({
          id: editingDevice
            ? "coldStorage.deviceForm.editTitle"
            : "coldStorage.deviceForm.addTitle",
        })}
        primaryButtonText={intl.formatMessage({
          id: editingDevice
            ? "coldStorage.deviceForm.update"
            : "coldStorage.deviceForm.create",
        })}
        secondaryButtonText={intl.formatMessage({ id: "button.cancel" })}
        primaryButtonDisabled={!isValid}
        size="sm"
      >
        <Form>
          <Stack gap={5}>
            <div>
              <FormLabel
                style={{
                  marginBottom: "1rem",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  color: "#161616",
                }}
              >
                {intl.formatMessage({
                  id: "coldStorage.deviceForm.basicInformation",
                })}
              </FormLabel>
              <Stack gap={5}>
                <TextInput
                  id="name"
                  labelText={intl.formatMessage({
                    id: "coldStorage.deviceForm.nameRequired",
                  })}
                  placeholder={intl.formatMessage({
                    id: "coldStorage.deviceForm.namePlaceholder",
                  })}
                  value={formData.name}
                  onChange={(e) => handleFormChange("name", e.target.value)}
                  required
                />

                <Select
                  id="deviceType"
                  labelText={intl.formatMessage({
                    id: "coldStorage.deviceForm.typeRequired",
                  })}
                  value={formData.deviceType}
                  onChange={(e) =>
                    handleFormChange("deviceType", e.target.value)
                  }
                  required
                >
                  {deviceTypeOptions.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      value={opt.value}
                      text={opt.label}
                    />
                  ))}
                </Select>

                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: "0.5rem",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <Select
                      id="roomId"
                      labelText={intl.formatMessage({
                        id: "coldStorage.deviceForm.roomRequired",
                      })}
                      value={formData.roomId}
                      onChange={(e) =>
                        handleFormChange("roomId", e.target.value)
                      }
                      required
                    >
                      <SelectItem
                        value=""
                        text={
                          locations.length === 0
                            ? intl.formatMessage({
                                id: "coldStorage.deviceForm.noRooms",
                              })
                            : intl.formatMessage({
                                id: "coldStorage.deviceForm.selectRoom",
                              })
                        }
                      />
                      {locations.map((location) => (
                        <SelectItem
                          key={location.id}
                          value={location.id.toString()}
                          text={location.name}
                        />
                      ))}
                    </Select>
                  </div>
                  {onAddRoom && (
                    <Button
                      kind="tertiary"
                      size="md"
                      renderIcon={Add}
                      onClick={onAddRoom}
                      style={{ marginBottom: "0.125rem" }}
                    >
                      {intl.formatMessage({ id: "coldStorage.room.addNew" })}
                    </Button>
                  )}
                </div>
              </Stack>
            </div>

            <div
              style={{
                borderTop: "1px solid #e0e0e0",
                paddingTop: "1rem",
                marginTop: "0.5rem",
              }}
            >
              <FormLabel
                style={{
                  marginBottom: "1rem",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  color: "#161616",
                }}
              >
                {intl.formatMessage({
                  id: "coldStorage.deviceForm.connectionSettings",
                })}
              </FormLabel>
              <Stack gap={5}>
                <Select
                  id="protocol"
                  labelText={intl.formatMessage({
                    id: "coldStorage.deviceForm.protocolRequired",
                  })}
                  value={formData.protocol}
                  onChange={(e) => handleFormChange("protocol", e.target.value)}
                >
                  {PROTOCOL_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      value={opt.value}
                      text={opt.label}
                    />
                  ))}
                </Select>

                {formData.protocol === "TCP" ? (
                  <>
                    <TextInput
                      id="host"
                      labelText={intl.formatMessage({
                        id: "coldStorage.deviceForm.hostRequired",
                      })}
                      placeholder={intl.formatMessage({
                        id: "coldStorage.deviceForm.hostPlaceholder",
                      })}
                      value={formData.host}
                      onChange={(e) => handleFormChange("host", e.target.value)}
                      required
                    />
                    <NumberInput
                      id="port"
                      translateWithId={translateNumberInput}
                      label={intl.formatMessage({
                        id: "coldStorage.deviceForm.portRequired",
                      })}
                      value={formData.port}
                      onChange={(e, { value }) =>
                        handleFormChange("port", value)
                      }
                      min={1}
                      max={65535}
                    />
                  </>
                ) : (
                  <>
                    <TextInput
                      id="serialPort"
                      labelText={intl.formatMessage({
                        id: "coldStorage.deviceForm.serialPortRequired",
                      })}
                      placeholder="/dev/ttyUSB0"
                      value={formData.serialPort}
                      onChange={(e) =>
                        handleFormChange("serialPort", e.target.value)
                      }
                      required
                    />
                    <NumberInput
                      id="baudRate"
                      translateWithId={translateNumberInput}
                      label={intl.formatMessage({
                        id: "coldStorage.deviceForm.baudRateRequired",
                      })}
                      value={formData.baudRate}
                      onChange={(e, { value }) =>
                        handleFormChange("baudRate", value)
                      }
                      min={300}
                      max={115200}
                    />
                    <NumberInput
                      id="dataBits"
                      translateWithId={translateNumberInput}
                      label={intl.formatMessage({
                        id: "coldStorage.deviceForm.dataBitsRequired",
                      })}
                      value={formData.dataBits}
                      onChange={(e, { value }) =>
                        handleFormChange("dataBits", value)
                      }
                      min={5}
                      max={8}
                    />
                    <NumberInput
                      id="stopBits"
                      translateWithId={translateNumberInput}
                      label={intl.formatMessage({
                        id: "coldStorage.deviceForm.stopBitsRequired",
                      })}
                      value={formData.stopBits}
                      onChange={(e, { value }) =>
                        handleFormChange("stopBits", value)
                      }
                      min={1}
                      max={2}
                    />
                    <Select
                      id="parity"
                      labelText={intl.formatMessage({
                        id: "coldStorage.deviceForm.parityRequired",
                      })}
                      value={formData.parity}
                      onChange={(e) =>
                        handleFormChange("parity", e.target.value)
                      }
                    >
                      {parityOptions.map((opt) => (
                        <SelectItem
                          key={opt.value}
                          value={opt.value}
                          text={opt.label}
                        />
                      ))}
                    </Select>
                  </>
                )}
              </Stack>
            </div>

            <div
              style={{
                borderTop: "1px solid #e0e0e0",
                paddingTop: "1rem",
                marginTop: "0.5rem",
              }}
            >
              <FormLabel
                style={{
                  marginBottom: "0.5rem",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                  color: "#161616",
                }}
              >
                {intl.formatMessage({
                  id: "coldStorage.deviceForm.modbusConfiguration",
                })}
              </FormLabel>
              <p
                style={{
                  fontSize: "0.75rem",
                  color: "#525252",
                  marginBottom: "1rem",
                }}
              >
                {intl.formatMessage({
                  id: "coldStorage.deviceForm.modbusDescription",
                })}
              </p>
              <Stack gap={5}>
                <NumberInput
                  id="slaveId"
                  translateWithId={translateNumberInput}
                  label={intl.formatMessage({
                    id: "coldStorage.deviceForm.slaveIdRequired",
                  })}
                  value={formData.slaveId}
                  onChange={(e, { value }) =>
                    handleFormChange("slaveId", value)
                  }
                  min={1}
                  max={255}
                />

                <div
                  style={{
                    backgroundColor: "#f4f4f4",
                    padding: "1rem",
                    borderRadius: "4px",
                  }}
                >
                  <FormLabel
                    style={{
                      marginBottom: "0.75rem",
                      fontSize: "0.8125rem",
                      fontWeight: "500",
                    }}
                  >
                    {intl.formatMessage({
                      id: "coldStorage.deviceForm.temperatureConfiguration",
                    })}
                  </FormLabel>
                  <Stack gap={4}>
                    <NumberInput
                      id="temperatureRegister"
                      translateWithId={translateNumberInput}
                      label={intl.formatMessage({
                        id: "coldStorage.deviceForm.temperatureRegisterRequired",
                      })}
                      value={formData.temperatureRegister}
                      onChange={(e, { value }) =>
                        handleFormChange("temperatureRegister", value)
                      }
                      min={0}
                      max={65535}
                    />

                    <NumberInput
                      id="temperatureScale"
                      translateWithId={translateNumberInput}
                      label={intl.formatMessage({
                        id: "coldStorage.deviceForm.temperatureScale",
                      })}
                      helperText={intl.formatMessage({
                        id: "coldStorage.deviceForm.scaleHelp",
                      })}
                      value={formData.temperatureScale}
                      onChange={(e, { value }) =>
                        handleFormChange("temperatureScale", value)
                      }
                      step={0.1}
                      min={0.01}
                    />

                    <NumberInput
                      id="temperatureOffset"
                      translateWithId={translateNumberInput}
                      label={intl.formatMessage({
                        id: "coldStorage.deviceForm.baseTemperature",
                      })}
                      helperText={intl.formatMessage({
                        id: "coldStorage.deviceForm.temperatureOffsetHelp",
                      })}
                      value={formData.temperatureOffset}
                      onChange={(e, { value }) =>
                        handleFormChange("temperatureOffset", value)
                      }
                      step={0.1}
                    />
                  </Stack>
                </div>

                <div
                  style={{
                    backgroundColor: "#f4f4f4",
                    padding: "1rem",
                    borderRadius: "4px",
                  }}
                >
                  <FormLabel
                    style={{
                      marginBottom: "0.75rem",
                      fontSize: "0.8125rem",
                      fontWeight: "500",
                    }}
                  >
                    {intl.formatMessage({
                      id: "coldStorage.deviceForm.humidityConfiguration",
                    })}
                  </FormLabel>
                  <Stack gap={4}>
                    <NumberInput
                      id="humidityRegister"
                      translateWithId={translateNumberInput}
                      label={intl.formatMessage({
                        id: "coldStorage.deviceForm.humidityRegister",
                      })}
                      helperText={intl.formatMessage({
                        id: "coldStorage.deviceForm.humidityRegisterHelp",
                      })}
                      value={formData.humidityRegister ?? ""}
                      onChange={(e, { value }) =>
                        handleFormChange("humidityRegister", value ?? 0)
                      }
                      min={0}
                      max={65535}
                      step={1}
                    />

                    <NumberInput
                      id="humidityScale"
                      translateWithId={translateNumberInput}
                      label={intl.formatMessage({
                        id: "coldStorage.deviceForm.humidityScale",
                      })}
                      helperText={intl.formatMessage({
                        id: "coldStorage.deviceForm.scaleHelp",
                      })}
                      value={formData.humidityScale}
                      onChange={(e, { value }) =>
                        handleFormChange("humidityScale", value)
                      }
                      step={0.1}
                      min={0.01}
                    />

                    <NumberInput
                      id="humidityOffset"
                      translateWithId={translateNumberInput}
                      label={intl.formatMessage({
                        id: "coldStorage.deviceForm.humidityOffset",
                      })}
                      helperText={intl.formatMessage({
                        id: "coldStorage.deviceForm.humidityOffsetHelp",
                      })}
                      value={formData.humidityOffset}
                      onChange={(e, { value }) =>
                        handleFormChange("humidityOffset", value)
                      }
                      step={0.1}
                    />
                  </Stack>
                </div>
              </Stack>
            </div>
          </Stack>
        </Form>
      </Modal>
    </>
  );
}
