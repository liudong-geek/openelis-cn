import React from "react";
import { ArrowRight } from "@carbon/icons-react";
import { Link } from "react-router-dom";
import { FormattedMessage } from "react-intl";
import PathRoute from "../utils/PathRoute";

const GlobalSideBar = (props) => {
  const { sideNav } = props;

  return (
    <div className={`oe-report-catalog ${sideNav.className || ""}`}>
      <nav className="oe-report-catalog__grid" aria-label="报告目录">
        {sideNav.sideNavMenuItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <section className="oe-report-group" key={`report-group-${index}`}>
              <header className="oe-report-group__header">
                {Icon && (
                  <span className="oe-report-group__icon" aria-hidden="true">
                    <Icon size={20} />
                  </span>
                )}
                <h2>{item.title}</h2>
              </header>
              <ul className="oe-report-group__links">
                {item.SideNavMenuItem.map((subItem, subIndex) => {
                  const isInternal = subItem.link?.startsWith("/");
                  const content = (
                    <>
                      <span>{subItem.label}</span>
                      <ArrowRight size={16} aria-hidden="true" />
                    </>
                  );

                  return (
                    <li key={`${index}-${subIndex}`}>
                      {subItem.securityRestricted ? (
                        <span
                          className="oe-report-group__disabled"
                          aria-disabled="true"
                        >
                          <span>{subItem.label}</span>
                          <span className="oe-report-group__status">
                            <FormattedMessage id="reports.securityReview.status" />
                          </span>
                        </span>
                      ) : isInternal ? (
                        <Link to={subItem.link}>{content}</Link>
                      ) : (
                        <a href={subItem.link}>{content}</a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </nav>
      {sideNav.contentRoutes.length > 0 && (
        <div className="oe-report-catalog__content">
          {sideNav.contentRoutes.map((route, index) => {
            return (
              <PathRoute key={"routePath_" + index} path={route.path}>
                {route.pageComponent}
              </PathRoute>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GlobalSideBar;
