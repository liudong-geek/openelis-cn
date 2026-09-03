import React, { useEffect, useRef, useState } from "react";
import { Button, Column, Form, Grid, Link, Loading } from "@carbon/react";
import { ArrowLeft, ArrowRight } from "@carbon/react/icons";
import { FormattedMessage, useIntl } from "react-intl";
import "../Style.css";
import TestSectionSelectForm from "./TestSectionSelectForm";
import TestSelectForm from "./TestSelectForm";
import PanelSelectForm from "./PanelSelectForm";
import PrioritySelectForm from "./PrioritySelectForm";
import { getFromOpenElisServer } from "../utils/Utils";

export default function WorkplanSearchForm(props) {
  const intl = useIntl();
  const mounted = useRef(false);
  const [selectedValue, setSelectedValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [nextPage, setNextPage] = useState(null);
  const [previousPage, setPreviousPage] = useState(null);
  const [pagination, setPagination] = useState(false);
  const [currentApiPage, setCurrentApiPage] = useState(null);
  const [totalApiPages, setTotalApiPages] = useState(null);
  const [url, setUrl] = useState("");

  let title = "";
  let urlToPost = "";
  const type = props.type;
  switch (type) {
    case "test":
      title = <FormattedMessage id="workplan.test.types" />;
      urlToPost = "/rest/WorkPlanByTest?test_id=";
      break;
    case "panel":
      title = <FormattedMessage id="workplan.panel.types" />;
      urlToPost = "/rest/WorkPlanByPanel?panel_id=";
      break;
    case "unit":
      title = <FormattedMessage id="workplan.unit.types" />;
      urlToPost = "/rest/WorkPlanByTestSection?test_section_id=";
      break;
    case "priority":
      title = <FormattedMessage id="workplan.priority.list" />;
      urlToPost = "/rest/WorkPlanByPriority?priority=";
      break;
    default:
      title = "";
  }

  const handleSelectedValue = (v, l) => {
    if (mounted.current) {
      setSelectedValue(v);
      props.selectedValue(v);
      props.selectedLabel(l);
    }
  };

  const getTestsList = (res) => {
    if (mounted.current) {
      const safeResponse = Array.isArray(res?.workplanTests)
        ? res
        : { workplanTests: [], paging: null };
      props.createTestsList(safeResponse);
      setPagination(false);
      setNextPage(null);
      setPreviousPage(null);
      setCurrentApiPage(null);
      setTotalApiPages(null);
      if (safeResponse.paging) {
        const { totalPages, currentPage } = safeResponse.paging;
        if (totalPages > 1) {
          setPagination(true);
          setCurrentApiPage(currentPage);
          setTotalApiPages(totalPages);
          if (parseInt(currentPage) < parseInt(totalPages)) {
            setNextPage(parseInt(currentPage) + 1);
          } else {
            setNextPage(null);
          }
          if (parseInt(currentPage) > 1) {
            setPreviousPage(parseInt(currentPage) - 1);
          } else {
            setPreviousPage(null);
          }
        }
      }
      setIsLoading(false);
    }
  };

  const loadNextResultsPage = () => {
    setIsLoading(true);
    getFromOpenElisServer(url + "&page=" + nextPage, getTestsList);
  };

  const loadPreviousResultsPage = () => {
    setIsLoading(true);
    getFromOpenElisServer(url + "&page=" + previousPage, getTestsList);
  };

  useEffect(() => {
    mounted.current = true;
    setNextPage(null);
    setPreviousPage(null);
    setPagination(false);
    if (!selectedValue) {
      setIsLoading(false);
      setUrl("");
      return () => {
        mounted.current = false;
      };
    }

    setIsLoading(true);
    setUrl(urlToPost + selectedValue);
    getFromOpenElisServer(urlToPost + selectedValue, getTestsList);
    return () => {
      mounted.current = false;
    };
  }, [selectedValue]);

  useEffect(() => {
    setNextPage(null);
    setPreviousPage(null);
    setPagination(false);
  }, []);

  return (
    <section className="oe-workplan-filter" aria-busy={isLoading}>
      <div className="oe-workplan-filter__heading">
        <h2>
          <FormattedMessage id="label.form.searchby" /> {title}
        </h2>
        <p>
          <FormattedMessage id="workplan.filter.help" />
        </p>
      </div>
      <Grid fullWidth condensed>
        <Column sm={4} md={5} lg={7}>
          <Form className="container-form">
            {type === "test" && (
              <TestSelectForm title={title} value={handleSelectedValue} />
            )}
            {type === "panel" && (
              <PanelSelectForm title={title} value={handleSelectedValue} />
            )}
            {type === "unit" && (
              <TestSectionSelectForm
                title={title}
                value={handleSelectedValue}
              />
            )}
            {type === "priority" && (
              <PrioritySelectForm title={title} value={handleSelectedValue} />
            )}
          </Form>
        </Column>
        <Column sm={4} md={3} lg={3}>
          {isLoading && (
            <div className="oe-workplan-filter__loading" aria-live="polite">
              <Loading
                small
                withOverlay={false}
                description={intl.formatMessage({ id: "loading.description" })}
              />
              <span>
                <FormattedMessage id="loading.description" />
              </span>
            </div>
          )}
        </Column>
      </Grid>
      {!selectedValue && !isLoading && (
        <div className="oe-workplan-filter__guidance" role="status">
          <FormattedMessage id="workplan.filter.required" />
        </div>
      )}
      {pagination && (
        <Grid condensed className="oe-workplan-api-pagination">
          <Column sm={4} md={8} lg={16}>
            <div className="oe-workplan-api-pagination__controls">
              <Link>
                {currentApiPage} / {totalApiPages}
              </Link>
              <div className="oe-workplan-api-pagination__buttons">
                <Button
                  hasIconOnly
                  id="loadpreviousresults"
                  onClick={loadPreviousResultsPage}
                  disabled={previousPage != null ? false : true}
                  renderIcon={ArrowLeft}
                  iconDescription={intl.formatMessage({
                    id: "pagination.previous",
                  })}
                ></Button>
                <Button
                  hasIconOnly
                  id="loadnextresults"
                  onClick={loadNextResultsPage}
                  disabled={nextPage != null ? false : true}
                  renderIcon={ArrowRight}
                  iconDescription={intl.formatMessage({
                    id: "pagination.next",
                  })}
                ></Button>
              </div>
            </div>
          </Column>
        </Grid>
      )}
    </section>
  );
}
