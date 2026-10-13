import AccountPage from "./_AccountPage";
import "./_group.css";

/**
 * Faithful preview wrapper: `_AccountPage` is the production account page
 * source copied verbatim apart from imports redirected to local fixture stubs.
 */
export function AccountSettings() {
  const dark = new URLSearchParams(window.location.search).get("theme") === "dark";
  return <div className={dark ? "dark" : undefined}><AccountPage /></div>;
}
