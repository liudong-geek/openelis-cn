import React, { useContext, useState, useEffect } from "react";
import {
  Form,
  TextInput,
  Button,
  Loading,
  Select,
  SelectItem,
  PasswordInput,
  Checkbox,
  FormGroup,
} from "@carbon/react";
import { FormattedMessage, injectIntl, useIntl } from "react-intl";
import { useLocation } from "react-router-dom";
import PageBreadCrumb from "../../common/PageBreadCrumb";
import {
  AlertDialog,
  NotificationKinds,
} from "../../common/CustomNotification";
import { ConfigurationContext, NotificationContext } from "../../layout/Layout";
import {
  getFromOpenElisServer,
  postToOpenElisServerJsonResponse,
} from "../../utils/Utils";
import CustomDatePicker from "../../common/CustomDatePicker";
import AutoComplete from "../../common/AutoComplete";
import ProductPageHeader from "../../common/ProductPageHeader";
import { navigateToInternalPath } from "../../utils/NavigationUtils";
import "../AdminFormWorkspace.css";

const breadcrumbs = [
  { label: "home.label", link: "/" },
  { label: "breadcrums.admin.managment", link: "/MasterListsPage" },
  {
    label: "unifiedSystemUser.browser.title",
    link: "/MasterListsPage/userManagement",
  },
];

const passwordPatternRegex = /^(?=.*[*$#!])(?=.*[a-zA-Z0-9]).{7,}$/;
const loginNameRegex = /^[a-zA-Z][a-zA-Z0-9._-]*$/;
const nameRegex = /^(?=.*\p{L})[\p{L}\p{M} .'_@-]*$/u;
const roleMessageIds = {
  "Analyser Import": "user.editor.role.analyzerImport",
  "Audit Trail": "user.editor.role.auditTrail",
  Cytopathologist: "user.editor.role.cytopathologist",
  "Global Administrator": "user.editor.role.globalAdministrator",
  Pathologist: "user.editor.role.pathologist",
  "User Account Administrator": "user.editor.role.userAdministrator",
  Reception: "user.editor.role.reception",
  Reports: "user.editor.role.reports",
  Results: "user.editor.role.results",
  Validation: "user.editor.role.validation",
};

function UserAddModify() {
  const { notificationVisible, setNotificationVisible, addNotification } =
    useContext(NotificationContext);
  const { configurationProperties } = useContext(ConfigurationContext);

  const intl = useIntl();

  const [saveButton, setSaveButton] = useState(true);
  const [validation, setValidation] = useState({
    validatepassword: false,
    password: false,
    password2: false,
    loginName: false,
    firstName: false,
    secondName: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [copyUserPermission, setCopyUserPermission] = useState("0");
  const [copyUserPermissionList, setCopyUserPermissionList] = useState(null);
  const [userData, setUserData] = useState(null);
  const [userDataShow, setUserDataShow] = useState({});
  const [userDataPost, setUserDataPost] = useState(null);
  const [selectedGlobalLabUnitRoles, setSelectedGlobalLabUnitRoles] = useState(
    [],
  );
  const [selectedTestSectionLabUnits, setSelectedTestSectionLabUnits] =
    useState({});
  const [selectedTestSectionList, setSelectedTestSectionList] = useState([]);
  const [passwordTouched, setPasswordTouched] = useState({
    userPassword: false,
    confirmPassword: false,
  });

  const location = useLocation();
  const ID = (() => {
    const search = location.search;
    if (search) {
      const urlParams = new URLSearchParams(search);
      return urlParams.get("ID");
    }
    return "0";
  })();

  useEffect(() => {
    setIsLoading(true);
    if (ID) {
      getFromOpenElisServer(
        `/rest/UnifiedSystemUser?ID=${ID}&startingRecNo=1&roleFilter=`,
        handleUserData,
      );
    } else {
      setTimeout(() => {
        navigateToInternalPath("/MasterListsPage/userManagement", {
          replace: true,
        });
      }, 200);
    }
  }, [ID]);

  const handleUserData = (res) => {
    if (!res) {
      setIsLoading(false);
      setNotificationVisible(true);
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "server.error.msg" }),
      });
    } else {
      setUserData(res);
      if (ID !== "0") {
        setValidation({
          validatepassword: true,
          password: true,
          password2: true,
          loginName: true,
          firstName: true,
          secondName: true,
        });
      }
      var KeyList = [];
      Object.keys(res.selectedTestSectionLabUnits || {}).map((key) =>
        KeyList.push(key),
      );
      setSelectedTestSectionList(KeyList);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    getFromOpenElisServer(`/rest/users`, handleCopyUserPermissionsList);
  }, []);

  const handleCopyUserPermissionsList = (res) => {
    if (res) {
      setCopyUserPermissionList(res);
    }
  };

  useEffect(() => {
    if (userData) {
      const userManagementInfoToShow = {
        accountActive: userData.accountActive,
        accountDisabled: userData.accountDisabled,
        accountLocked: userData.accountLocked,
        allowCopyUserRoles: userData.allowCopyUserRoles,
        cancelAction: userData.cancelAction,
        cancelMethod: userData.cancelMethod,
        confirmPassword: ID === "0" ? "" : userData.confirmPassword,
        expirationDate: userData.expirationDate,
        formAction: userData.formAction,
        formMethod: userData.formMethod,
        formName: userData.formName,
        loginUserId: userData.loginUserId,
        selectedRoles: userData.selectedRoles,
        selectedTestSectionLabUnits: userData.selectedTestSectionLabUnits,
        systemUserId: userData.systemUserId,
        systemUserIdToCopy: userData.systemUserIdToCopy,
        systemUserLastupdated: userData.systemUserLastupdated,
        timeout: userData.timeout,
        userFirstName: ID === "0" ? "" : userData.userFirstName,
        userLastName: ID === "0" ? "" : userData.userLastName,
        userLoginName: ID === "0" ? "" : userData.userLoginName,
        userPassword: ID === "0" ? "" : userData.userPassword,
      };

      const userManagementInfoToPost = {
        accountActive: userData.accountActive,
        accountDisabled: userData.accountDisabled,
        accountLocked: userData.accountLocked,
        allowCopyUserRoles: userData.allowCopyUserRoles,
        cancelAction: userData.cancelAction,
        cancelMethod: userData.cancelMethod,
        confirmPassword: ID === "0" ? "" : userData.confirmPassword,
        expirationDate: userData.expirationDate,
        formAction: userData.formAction,
        formMethod: userData.formMethod,
        formName: userData.formName,
        globalRoles: userData.globalRoles,
        labUnitRoles: userData.labUnitRoles,
        loginUserId: userData.loginUserId,
        selectedRoles: userData.selectedRoles,
        selectedTestSectionLabUnits: userData.selectedTestSectionLabUnits,
        systemUserId: userData.systemUserId,
        systemUserIdToCopy: userData.systemUserIdToCopy,
        systemUserLastupdated: userData.systemUserLastupdated,
        testSections: userData.testSections,
        timeout: userData.timeout,
        userFirstName: ID === "0" ? "" : userData.userFirstName,
        userLastName: ID === "0" ? "" : userData.userLastName,
        userLoginName: ID === "0" ? "" : userData.userLoginName,
        userPassword: ID === "0" ? "" : userData.userPassword,
      };
      setUserDataShow(userManagementInfoToShow);
      setUserDataPost(userManagementInfoToPost);

      if (userData.globalRoles) {
        const globalRoles = userData.globalRoles.map((item) => {
          return {
            childrenID: item.childrenID,
            elementID: item.elementID,
            groupingRole: item.groupingRole,
            nestingLevel: item.nestingLevel,
            parentRole: item.parentRole,
            roleId: item.roleId,
            roleName: item.roleName,
          };
        });
        setUserDataShow((prevUserDataShow) => ({
          ...prevUserDataShow,
          globalRoles: globalRoles,
        }));
      }

      if (userData.labUnitRoles) {
        const labUnitRoles = userData.labUnitRoles.map((item) => {
          return {
            childrenID: item.childrenID,
            elementID: item.elementID,
            groupingRole: item.groupingRole,
            nestingLevel: item.nestingLevel,
            parentRole: item.parentRole,
            roleId: item.roleId,
            roleName: item.roleName,
          };
        });
        setUserDataShow((prevUserDataShow) => ({
          ...prevUserDataShow,
          labUnitRoles: labUnitRoles,
        }));
      }

      if (userData.testSections) {
        const testSections = userData.testSections.map((item) => {
          return {
            id: item.id,
            value: item.value,
          };
        });
        const updatedTestSections = [
          {
            id: "AllLabUnits",
            value: intl.formatMessage({ id: "user.editor.allLabUnits" }),
          },
          ...testSections,
        ];
        setUserDataShow((prevUserDataShow) => ({
          ...prevUserDataShow,
          testSections: updatedTestSections,
        }));
      }

      if (userData.selectedRoles !== undefined) {
        if (ID !== "0") {
          const selectedGlobalLabUnitRoles = userData.selectedRoles.map(
            (item) => item,
          );
          setSelectedGlobalLabUnitRoles(selectedGlobalLabUnitRoles);
        } else {
          setSelectedGlobalLabUnitRoles([]);
        }
      } else {
        setSelectedGlobalLabUnitRoles([]);
      }

      if (userData.selectedTestSectionLabUnits) {
        if (ID !== "0") {
          setSelectedTestSectionLabUnits(userData.selectedTestSectionLabUnits);
        } else {
          setSelectedTestSectionLabUnits({});
          setSelectedTestSectionList([]);
        }
      }
    }
  }, [userData, ID, intl]);

  useEffect(() => {
    if (userDataShow) {
      if (
        userDataShow.userPassword &&
        userDataShow.userPassword === userDataShow.confirmPassword
      ) {
        setValidation({ ...validation, validatepassword: true });
      } else {
        setValidation({ ...validation, validatepassword: false });
      }
    }
  }, [userDataShow]);

  useEffect(() => {
    if (copyUserPermission) {
      setUserDataPost((prevUserDataPost) => ({
        ...prevUserDataPost,
        systemUserIdToCopy: copyUserPermission,
        allowCopyUserRoles: "Y",
      }));
      setUserDataShow((prevUserData) => ({
        ...prevUserData,
        systemUserIdToCopy: copyUserPermission,
        allowCopyUserRoles: "Y",
      }));
    }
  }, [copyUserPermission]);

  useEffect(() => {
    if (selectedTestSectionLabUnits) {
      setUserDataPost((prevUserDataPost) => ({
        ...prevUserDataPost,
        selectedTestSectionLabUnits: selectedTestSectionLabUnits,
      }));

      setUserDataShow((prevUserData) => ({
        ...prevUserData,
        selectedTestSectionLabUnits: selectedTestSectionLabUnits,
      }));
    }
  }, [selectedTestSectionLabUnits]);

  function userSavePostCall() {
    setIsLoading(true);
    postToOpenElisServerJsonResponse(
      `/rest/UnifiedSystemUser`,
      JSON.stringify(userDataPost),
      (res) => {
        userSavePostCallback(res);
      },
    );
  }

  function userSavePostCallback(res) {
    const failed =
      !res ||
      Boolean(res.error) ||
      Number(res.status || res.statusCode || 0) >= 400;
    if (!failed) {
      setIsLoading(false);
      addNotification({
        title: intl.formatMessage({
          id: "notification.title",
        }),
        message: intl.formatMessage({
          id: "notification.user.post.save.success",
        }),
        kind: NotificationKinds.success,
      });
      setNotificationVisible(true);
      setTimeout(() => {
        navigateToInternalPath("/MasterListsPage/userManagement", {
          replace: true,
        });
      }, 200);
    } else {
      setIsLoading(false);
      addNotification({
        kind: NotificationKinds.error,
        title: intl.formatMessage({ id: "notification.title" }),
        message: intl.formatMessage({ id: "server.error.msg" }),
      });
      setNotificationVisible(true);
    }
  }

  function handleUserLoginNameChange(e) {
    const value = e.target.value.trim();
    const isValid = loginNameRegex.test(value);

    if (!value || (value && !isValid)) {
      if (!notificationVisible) {
        setNotificationVisible(true);
        addNotification({
          title: intl.formatMessage({ id: "notification.title" }),
          message: intl.formatMessage({
            id: "notification.invalid.loginName",
          }),
          kind: NotificationKinds.info,
        });
      }
      setSaveButton(true);
      setValidation({ ...validation, loginName: false });
    } else {
      setNotificationVisible(false);
      setSaveButton(false);
      setValidation({ ...validation, loginName: true });
      setUserDataPost((prevUserDataPost) => ({
        ...prevUserDataPost,
        userLoginName: value,
      }));
    }

    setUserDataShow((prevUserData) => ({
      ...prevUserData,
      userLoginName: value,
    }));
  }

  function handleUserPasswordChange(e) {
    setPasswordTouched((prev) => ({
      ...prev,
      userPassword: true,
    }));
    const value = e.target.value.trim();
    const isValid = passwordPatternRegex.test(value);

    if (value && !isValid) {
      if (!notificationVisible) {
        setNotificationVisible(true);
        addNotification({
          title: intl.formatMessage({ id: "notification.title" }),
          message: intl.formatMessage({
            id: "notification.invalid.password",
          }),
          kind: NotificationKinds.info,
        });
      }
      setSaveButton(true);
      setValidation({ ...validation, password: false });
    } else {
      setNotificationVisible(false);
      setSaveButton(false);
      setValidation({ ...validation, password: true });
      setUserDataPost((prevUserDataPost) => ({
        ...prevUserDataPost,
        userPassword: value,
      }));
    }

    setUserDataShow((prevUserData) => ({
      ...prevUserData,
      userPassword: value,
    }));
  }

  function handleConfirmPasswordChange(e) {
    setPasswordTouched((prev) => ({
      ...prev,
      confirmPassword: true,
    }));
    const value = e.target.value.trim();
    const isValid = passwordPatternRegex.test(value);

    if (value && !isValid) {
      if (!notificationVisible) {
        setNotificationVisible(true);
        addNotification({
          title: intl.formatMessage({ id: "notification.title" }),
          message: intl.formatMessage({
            id: "notification.invalid.confirm.password",
          }),
          kind: NotificationKinds.info,
        });
      }
      setSaveButton(true);
      setValidation({ ...validation, password2: false });
    } else {
      setNotificationVisible(false);
      setSaveButton(false);
      setValidation({ ...validation, password2: true });
      setUserDataPost((prevUserDataPost) => ({
        ...prevUserDataPost,
        confirmPassword: value,
      }));
    }

    setUserDataShow((prevUserData) => ({
      ...prevUserData,
      confirmPassword: value,
    }));
  }

  function handleUserFirstNameChange(e) {
    const value = e.target.value;
    const isValid = nameRegex.test(value);

    if (!value || (value && !isValid)) {
      if (!notificationVisible) {
        setNotificationVisible(true);
        addNotification({
          title: intl.formatMessage({ id: "notification.title" }),
          message: intl.formatMessage({
            id: "notification.invalid.name",
          }),
          kind: NotificationKinds.info,
        });
      }
      setSaveButton(true);
      setValidation({ ...validation, firstName: false });
    } else {
      setNotificationVisible(false);
      setSaveButton(false);
      setValidation({ ...validation, firstName: true });
      setUserDataPost((prevUserDataPost) => ({
        ...prevUserDataPost,
        userFirstName: value,
      }));
    }

    setUserDataShow((prevUserData) => ({
      ...prevUserData,
      userFirstName: value,
    }));
  }

  function handleUserLastNameChange(e) {
    const value = e.target.value;
    const isValid = nameRegex.test(value);

    if (!value || (value && !isValid)) {
      if (!notificationVisible) {
        setNotificationVisible(true);
        addNotification({
          title: intl.formatMessage({ id: "notification.title" }),
          message: intl.formatMessage({
            id: "notification.invalid.name",
          }),
          kind: NotificationKinds.info,
        });
      }
      setSaveButton(true);
      setValidation({ ...validation, secondName: false });
    } else {
      setNotificationVisible(false);
      setUserDataPost((prevUserDataPost) => ({
        ...prevUserDataPost,
        userLastName: value,
      }));
      setSaveButton(false);
      setValidation({ ...validation, secondName: true });
    }

    setUserDataShow((prevUserData) => ({
      ...prevUserData,
      userLastName: value,
    }));
  }

  function handleExpirationDateChange(date) {
    setSaveButton(false);
    setValidation({ ...validation, expDate: true });
    setUserDataPost((prevUserDataPost) => ({
      ...prevUserDataPost,
      expirationDate: date,
    }));
    setUserDataShow((prevUserData) => ({
      ...prevUserData,
      expirationDate: date,
    }));
  }

  function handleTimeoutChange(e) {
    setSaveButton(false);
    setValidation({ ...validation, timeout: true });
    setUserDataPost((prevUserDataPost) => ({
      ...prevUserDataPost,
      timeout: e.target.value,
    }));
    setUserDataShow((prevUserData) => ({
      ...prevUserData,
      timeout: e.target.value,
    }));
  }

  function handleAccountActiveChange(e) {
    setSaveButton(false);
    setValidation({ ...validation, active: true });
    setUserDataPost((prevUserDataPost) => ({
      ...prevUserDataPost,
      accountActive: e.target.value,
    }));
    setUserDataShow((prevUserData) => ({
      ...prevUserData,
      accountActive: e.target.value,
    }));
  }

  function handleAccountDisabledChange(e) {
    setSaveButton(false);
    setValidation({ ...validation, disabled: true });
    setUserDataPost((prevUserDataPost) => ({
      ...prevUserDataPost,
      accountDisabled: e.target.value,
    }));
    setUserDataShow((prevUserData) => ({
      ...prevUserData,
      accountDisabled: e.target.value,
    }));
  }

  function handleAccountLockedChange(e) {
    setSaveButton(false);
    setValidation({ ...validation, locked: true });
    setUserDataPost((prevUserDataPost) => ({
      ...prevUserDataPost,
      accountLocked: e.target.value,
    }));
    setUserDataShow((prevUserData) => ({
      ...prevUserData,
      accountLocked: e.target.value,
    }));
  }

  function handleCopyUserPermissionsChange() {
    if (copyUserPermission.length > 0) {
      setSaveButton(false);
      setValidation({ ...validation, copy: true });
    }
  }

  function handleAutoCompleteCopyUserPermissionsChange(selectedUserId) {
    setCopyUserPermission(selectedUserId);
    setSaveButton(false);
    setValidation({ ...validation, autoCopy: true });
  }

  function handleCopyUserPermissionsChangeClick() {
    setSelectedTestSectionLabUnits([]);
    setSelectedTestSectionList([]);
    userSavePostCall();
  }

  function handleCheckboxChange(roleId) {
    const numberToUpdate = userDataShow.globalRoles
      .filter((role) => role.roleName !== "Global Administrator")
      .map((role) => role.roleId);
    let updatedRoles = [...selectedGlobalLabUnitRoles];

    const globalAdminRoleId = userDataShow.globalRoles.find(
      (role) => role.roleName === "Global Administrator",
    )?.roleId;

    if (globalAdminRoleId && roleId === globalAdminRoleId) {
      if (selectedGlobalLabUnitRoles.includes(roleId)) {
        updatedRoles = updatedRoles.filter((role) => role !== roleId);
      } else {
        updatedRoles = Array.from(
          new Set([...updatedRoles, roleId, ...numberToUpdate]),
        );
      }
    } else {
      if (selectedGlobalLabUnitRoles.includes(roleId)) {
        updatedRoles = updatedRoles.filter((id) => id !== roleId);
      } else {
        updatedRoles = [...updatedRoles, roleId];
      }
    }

    setSelectedGlobalLabUnitRoles(updatedRoles);
    setUserDataPost((prevUserDataPost) => ({
      ...prevUserDataPost,
      selectedRoles: updatedRoles,
    }));
    setUserDataShow((prevUserDataPost) => ({
      ...prevUserDataPost,
      selectedRoles: updatedRoles,
    }));
    setSaveButton(false);
    setValidation({ ...validation, checkBox: true });
  }

  function handleTestSectionsSelectChange(e, key) {
    const selectedValue = e.target.value;
    const index = selectedTestSectionList.indexOf(key);
    if (index != -1) {
      const testSectionList = [...selectedTestSectionList];
      testSectionList[index] = selectedValue;
      setSelectedTestSectionList(testSectionList);
    }

    if (Object.keys(selectedTestSectionLabUnits).includes(selectedValue)) {
      alert(`Section ${selectedValue} is already selected.`);
      const updatedSelections = { ...selectedTestSectionLabUnits };
      delete updatedSelections[selectedValue];
      setSelectedTestSectionLabUnits(updatedSelections);
      return;
    }

    let updatedTestSectionLabUnits = { ...selectedTestSectionLabUnits };

    if (!Object.keys(updatedTestSectionLabUnits).includes(selectedValue)) {
      updatedTestSectionLabUnits[selectedValue] = [];
    } else {
      delete updatedTestSectionLabUnits[selectedValue];
    }

    if (key !== selectedValue) {
      delete updatedTestSectionLabUnits[key];
    }

    setSelectedTestSectionLabUnits(updatedTestSectionLabUnits);
    setSaveButton(false);
    setValidation({ ...validation, testSection: true });
  }

  const addRoleToSelectedUnits = (key, roleIdToAdd) => {
    setSelectedTestSectionLabUnits((prevUnits) => {
      const updatedUnits = { ...prevUnits };
      const currentRoles = updatedUnits[key] || [];
      if (!currentRoles.includes(roleIdToAdd)) {
        updatedUnits[key] = [...currentRoles, roleIdToAdd];
        setSaveButton(false);
        setValidation({ ...validation, role: true });
      }
      return updatedUnits;
    });
  };

  const removeRoleFromSelectedUnits = (key, roleIdToRemove) => {
    setSelectedTestSectionLabUnits((prevUnits) => {
      const updatedUnits = { ...prevUnits };
      if (updatedUnits[key]) {
        updatedUnits[key] = updatedUnits[key].filter(
          (roleId) => roleId !== roleIdToRemove,
        );
        setSaveButton(false);
        setValidation({ ...validation, removeSelected: true });
      }
      return updatedUnits;
    });
  };

  const addNewSection = () => {
    const newSectionsToAdd = userDataShow.testSections.filter(
      (section) =>
        !Object.keys(selectedTestSectionLabUnits).includes(section.id),
    );

    if (newSectionsToAdd.length > 0) {
      const nextSectionToAdd = newSectionsToAdd[0];
      setSelectedTestSectionLabUnits((prev) => ({
        ...prev,
        [nextSectionToAdd.id]: [],
      }));
      const testSectionList = [...selectedTestSectionList];
      testSectionList.push(nextSectionToAdd.id);
      setSelectedTestSectionList(testSectionList);
    }
  };

  const removeSection = (keyToRemove) => {
    const updatedSections = { ...selectedTestSectionLabUnits };
    delete updatedSections[keyToRemove];
    setSelectedTestSectionLabUnits(updatedSections);
    const index = selectedTestSectionList.indexOf(keyToRemove);
    if (index != -1) {
      const testSectionList = [...selectedTestSectionList];
      testSectionList.splice(index, 1);
      setSelectedTestSectionList(testSectionList);
    }
  };

  const cancel = () =>
    navigateToInternalPath("/MasterListsPage/userManagement", {
      replace: true,
    });

  const formatRoleName = (roleName) => {
    const messageId = roleMessageIds[String(roleName || "").trim()];
    return messageId ? intl.formatMessage({ id: messageId }) : roleName;
  };

  const passwordChanged =
    passwordTouched.userPassword || passwordTouched.confirmPassword;
  const passwordValid =
    ID !== "0" && !passwordChanged
      ? true
      : passwordPatternRegex.test(userDataShow.userPassword || "") &&
        userDataShow.userPassword === userDataShow.confirmPassword;
  const requiredFieldsValid =
    loginNameRegex.test(userDataShow.userLoginName || "") &&
    nameRegex.test(userDataShow.userFirstName || "") &&
    nameRegex.test(userDataShow.userLastName || "") &&
    Boolean(userDataShow.expirationDate) &&
    userDataShow.timeout !== undefined &&
    userDataShow.timeout !== "" &&
    passwordValid;
  const saveDisabled = saveButton || !requiredFieldsValid;

  if (isLoading) return <Loading />;

  return (
    <>
      {notificationVisible === true ? <AlertDialog /> : null}
      <div className="adminPageContent admin-form-workspace user-editor-page">
        <PageBreadCrumb breadcrumbs={breadcrumbs} />
        <ProductPageHeader
          title={
            <FormattedMessage
              id={
                ID === "0"
                  ? "unifiedSystemUser.add.user"
                  : "unifiedSystemUser.edit.user"
              }
            />
          }
          subtitle={<FormattedMessage id="user.editor.subtitle" />}
        />

        <Form className="admin-form-workspace__content">
          <section className="admin-form-workspace__card">
            <div className="admin-form-workspace__card-heading">
              <h2>
                <FormattedMessage id="user.editor.identity.title" />
              </h2>
              <p>
                <FormattedMessage id="user.editor.identity.subtitle" />
              </p>
            </div>
            <div className="admin-form-workspace__fields">
              <TextInput
                id="login-name"
                labelText={intl.formatMessage({ id: "login.login.name" })}
                value={userDataShow.userLoginName || ""}
                invalid={
                  Boolean(userDataShow.userLoginName) &&
                  !loginNameRegex.test(userDataShow.userLoginName)
                }
                invalidText={intl.formatMessage({
                  id: "notification.invalid.loginName",
                })}
                onChange={handleUserLoginNameChange}
                required
              />
              <CustomDatePicker
                id="password-expire-date"
                labelText={intl.formatMessage({
                  id: "login.password.expired.date",
                })}
                disallowPastDate
                updateStateValue
                value={userDataShow.expirationDate || ""}
                onChange={handleExpirationDateChange}
                required
              />
              <TextInput
                id="first-name"
                labelText={intl.formatMessage({ id: "login.login.first" })}
                value={userDataShow.userFirstName || ""}
                invalid={
                  Boolean(userDataShow.userFirstName) &&
                  !nameRegex.test(userDataShow.userFirstName)
                }
                invalidText={intl.formatMessage({
                  id: "notification.invalid.name",
                })}
                onChange={handleUserFirstNameChange}
                required
              />
              <TextInput
                id="last-name"
                labelText={intl.formatMessage({ id: "login.login.last" })}
                value={userDataShow.userLastName || ""}
                invalid={
                  Boolean(userDataShow.userLastName) &&
                  !nameRegex.test(userDataShow.userLastName)
                }
                invalidText={intl.formatMessage({
                  id: "notification.invalid.name",
                })}
                onChange={handleUserLastNameChange}
                required
              />
              <TextInput
                id="login-timeout"
                type="number"
                min={0}
                labelText={intl.formatMessage({ id: "login.timeout" })}
                helperText={intl.formatMessage({
                  id: "user.editor.timeout.helper",
                })}
                value={userDataShow.timeout ?? ""}
                onChange={handleTimeoutChange}
                required
              />
            </div>
          </section>

          <section className="admin-form-workspace__card">
            <div className="admin-form-workspace__card-heading">
              <h2>
                <FormattedMessage id="user.editor.security.title" />
              </h2>
              <p>
                <FormattedMessage id="user.editor.security.subtitle" />
              </p>
            </div>
            <div className="admin-form-workspace__fields">
              <div className="admin-form-workspace__hint admin-form-workspace__field--wide">
                <strong>
                  <FormattedMessage id="login.complexity.message" />
                </strong>
                <ul>
                  <li>
                    <FormattedMessage id="login.complexity.message.1" />
                  </li>
                  <li>
                    <FormattedMessage id="login.complexity.message.2" />
                  </li>
                  <li>
                    <FormattedMessage id="login.complexity.message.3" />
                  </li>
                  <li>
                    <FormattedMessage id="login.complexity.message.4" />
                  </li>
                </ul>
              </div>
              <PasswordInput
                id="login-password"
                labelText={intl.formatMessage({ id: "login.login.password" })}
                value={userDataShow.userPassword || ""}
                invalid={
                  passwordTouched.userPassword &&
                  !passwordPatternRegex.test(userDataShow.userPassword || "")
                }
                invalidText={intl.formatMessage({
                  id: "notification.invalid.password",
                })}
                onChange={handleUserPasswordChange}
                required={ID === "0"}
              />
              <PasswordInput
                id="login-repeat-password"
                labelText={intl.formatMessage({
                  id: "login.login.repeat.password",
                })}
                value={userDataShow.confirmPassword || ""}
                invalid={
                  passwordTouched.confirmPassword &&
                  (!passwordPatternRegex.test(
                    userDataShow.confirmPassword || "",
                  ) ||
                    userDataShow.confirmPassword !== userDataShow.userPassword)
                }
                invalidText={intl.formatMessage({
                  id: "user.editor.passwordMismatch",
                })}
                onChange={handleConfirmPasswordChange}
                required={ID === "0"}
              />
              <Select
                id="account-active"
                labelText={intl.formatMessage({ id: "systemuser.isActive" })}
                value={userDataShow.accountActive || "N"}
                onChange={handleAccountActiveChange}
              >
                <SelectItem
                  value="Y"
                  text={intl.formatMessage({ id: "label.yes" })}
                />
                <SelectItem
                  value="N"
                  text={intl.formatMessage({ id: "label.no" })}
                />
              </Select>
              <Select
                id="account-locked"
                labelText={intl.formatMessage({ id: "login.account.locked" })}
                value={userDataShow.accountLocked || "N"}
                onChange={handleAccountLockedChange}
              >
                <SelectItem
                  value="N"
                  text={intl.formatMessage({ id: "label.no" })}
                />
                <SelectItem
                  value="Y"
                  text={intl.formatMessage({ id: "label.yes" })}
                />
              </Select>
              <Select
                id="account-disabled"
                labelText={intl.formatMessage({ id: "login.account.disabled" })}
                value={userDataShow.accountDisabled || "N"}
                onChange={handleAccountDisabledChange}
              >
                <SelectItem
                  value="N"
                  text={intl.formatMessage({ id: "label.no" })}
                />
                <SelectItem
                  value="Y"
                  text={intl.formatMessage({ id: "label.yes" })}
                />
              </Select>
            </div>
          </section>

          <section className="admin-form-workspace__card">
            <div className="admin-form-workspace__card-heading">
              <h2>
                <FormattedMessage id="systemuser.role" />
              </h2>
              <p>
                <FormattedMessage id="user.editor.permissions.subtitle" />
              </p>
            </div>
            <div className="admin-form-workspace__fields">
              <div className="admin-form-workspace__inline-action admin-form-workspace__field--wide">
                <AutoComplete
                  name="copy-permissions"
                  id="copy-permissions"
                  allowFreeText={
                    configurationProperties.restrictFreeTextProviderEntry !==
                    "true"
                  }
                  onChange={handleCopyUserPermissionsChange}
                  onSelect={handleAutoCompleteCopyUserPermissionsChange}
                  suggestions={copyUserPermissionList || []}
                  label={intl.formatMessage({
                    id: "systemuserrole.copypermissions",
                  })}
                />
                <Button
                  data-cy="apply-button"
                  kind="tertiary"
                  disabled={copyUserPermission === "0"}
                  type="button"
                  onClick={handleCopyUserPermissionsChangeClick}
                >
                  <FormattedMessage id="systemuserrole.apply" />
                </Button>
              </div>
              <div className="admin-form-workspace__field--wide">
                <p className="admin-form-workspace__required-note">
                  <FormattedMessage id="user.editor.copy.helper" />
                </p>
              </div>
              <div className="admin-form-workspace__field--wide">
                <h3>
                  <FormattedMessage id="systemuserrole.roles.global" />
                </h3>
                <FormGroup legendId="globalRules" legendText="">
                  <div className="admin-form-workspace__checks">
                    {userDataShow.globalRoles?.length > 0 ? (
                      userDataShow.globalRoles.map((role) => (
                        <Checkbox
                          key={role.elementID}
                          id={role.elementID}
                          value={role.roleId}
                          labelText={formatRoleName(role.roleName)}
                          checked={selectedGlobalLabUnitRoles.includes(
                            role.roleId,
                          )}
                          onChange={() => handleCheckboxChange(role.roleId)}
                        />
                      ))
                    ) : (
                      <p>
                        <FormattedMessage id="label.no.options.available" />
                      </p>
                    )}
                  </div>
                </FormGroup>
              </div>
            </div>

            <div className="admin-form-workspace__permission-list">
              {selectedTestSectionList.map((key) => (
                <div
                  className="admin-form-workspace__permission-card"
                  key={key}
                >
                  <Select
                    id={`select-${key}`}
                    labelText={intl.formatMessage({
                      id: "user.editor.labUnit",
                    })}
                    value={key}
                    onChange={(event) =>
                      handleTestSectionsSelectChange(event, key)
                    }
                  >
                    {userDataShow.testSections
                      ?.filter(
                        (section) =>
                          !Object.keys(selectedTestSectionLabUnits).includes(
                            section.id,
                          ) || section.id === key,
                      )
                      .map((section) => (
                        <SelectItem
                          key={`${section.id}-${key}`}
                          value={section.id}
                          text={section.value}
                        />
                      ))}
                  </Select>
                  <FormGroup
                    legendId={`labUnitRoles-${key}`}
                    legendText={intl.formatMessage({
                      id: "user.editor.permissions",
                    })}
                  >
                    <Checkbox
                      id={`all-permissions-${key}`}
                      labelText={intl.formatMessage({
                        id: "user.editor.permissions.all",
                      })}
                      checked={["4", "5", "7", "10"].every((roleId) =>
                        selectedTestSectionLabUnits[key]?.includes(roleId),
                      )}
                      onChange={() => {
                        const standardRoles = ["4", "5", "7", "10"];
                        const currentRoles = [
                          ...(selectedTestSectionLabUnits[key] || []),
                        ];
                        const allSelected = standardRoles.every((roleId) =>
                          currentRoles.includes(roleId),
                        );
                        setSelectedTestSectionLabUnits((current) => ({
                          ...current,
                          [key]: allSelected
                            ? currentRoles.filter(
                                (roleId) => !standardRoles.includes(roleId),
                              )
                            : [...new Set([...currentRoles, ...standardRoles])],
                        }));
                        setSaveButton(false);
                      }}
                    />
                    {userDataShow.labUnitRoles?.map((role) => (
                      <Checkbox
                        key={`${role.elementID}-${key}`}
                        id={`${role.elementID}-${key}`}
                        value={role.roleId}
                        labelText={formatRoleName(role.roleName)}
                        checked={selectedTestSectionLabUnits[key]?.includes(
                          role.roleId,
                        )}
                        onChange={() => {
                          if (
                            selectedTestSectionLabUnits[key]?.includes(
                              role.roleId,
                            )
                          ) {
                            removeRoleFromSelectedUnits(key, role.roleId);
                          } else {
                            addRoleToSelectedUnits(key, role.roleId);
                          }
                        }}
                      />
                    ))}
                  </FormGroup>
                  <Button
                    data-cy="removePermission"
                    onClick={() => removeSection(key)}
                    kind="danger--ghost"
                    size="sm"
                    type="button"
                  >
                    <FormattedMessage id="systemuserrole.rmpermissions" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="admin-form-workspace__subactions">
              <Button
                data-cy="addNewPermission"
                onClick={addNewSection}
                kind="tertiary"
                type="button"
              >
                <FormattedMessage id="systemuserrole.newpermissions" />
              </Button>
            </div>
          </section>

          <div className="admin-form-workspace__actions">
            <Button kind="secondary" type="button" onClick={cancel}>
              <FormattedMessage id="label.button.cancel" />
            </Button>
            <Button
              disabled={saveDisabled}
              data-cy="saveButton"
              onClick={userSavePostCall}
              type="button"
            >
              <FormattedMessage id="label.button.save" />
            </Button>
          </div>
        </Form>
      </div>
    </>
  );
}

export default injectIntl(UserAddModify);
