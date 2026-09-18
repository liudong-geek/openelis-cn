import React, { useEffect, useRef, useState } from "react";
import { ComboBox } from "@carbon/react";
import { useIntl } from "react-intl";
import { getFromOpenElisServer } from "../utils/Utils";

const normalizeItems = (response) =>
  Array.isArray(response)
    ? response.filter(
        (item) =>
          item &&
          item.id !== undefined &&
          item.id !== null &&
          typeof item.value === "string",
      )
    : [];

export default function WorkplanFilterSelect({
  id,
  endpoint,
  queryParameter,
  placeholderId,
  title,
  value,
}) {
  const intl = useIntl();
  const mounted = useRef(false);
  const valueRef = useRef(value);
  const [items, setItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const placeholder = intl.formatMessage({ id: placeholderId });

  valueRef.current = value;

  useEffect(() => {
    mounted.current = true;
    const requestedId =
      new URLSearchParams(window.location.search).get(queryParameter) || "";

    getFromOpenElisServer(endpoint, (response) => {
      if (!mounted.current) return;

      const nextItems = normalizeItems(response);
      const nextSelected =
        nextItems.find((item) => String(item.id) === requestedId) || null;

      setItems(nextItems);
      setSelectedItem(nextSelected);
      valueRef.current(
        nextSelected ? String(nextSelected.id) : "",
        nextSelected?.value || placeholder,
      );
    });

    return () => {
      mounted.current = false;
    };
  }, [endpoint, placeholder, queryParameter]);

  const handleChange = ({ selectedItem: nextSelected }) => {
    setSelectedItem(nextSelected || null);
    valueRef.current(
      nextSelected ? String(nextSelected.id) : "",
      nextSelected?.value || placeholder,
    );
  };

  return (
    <ComboBox
      id={id}
      items={items}
      itemToString={(item) => item?.value || ""}
      selectedItem={selectedItem}
      titleText={title}
      placeholder={placeholder}
      onChange={handleChange}
      shouldFilterItem={({ item, inputValue }) =>
        item.value.toLocaleLowerCase().includes(inputValue.toLocaleLowerCase())
      }
    />
  );
}
