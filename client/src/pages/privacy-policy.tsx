export default function PrivacyPolicyPage() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px 80px", fontFamily: "system-ui, sans-serif", color: "#1a1a1a", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>Privacy Policy</h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 36 }}>
        FIA Academy Toolkit Chrome Extension &nbsp;·&nbsp; Last updated: July 2026
      </p>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Overview</h2>
        <p>
          The FIA Academy Toolkit extension ("Extension") is a private tool exclusively for members of the
          Fearless Influence Academy ("FIA Academy"). This policy explains what data the Extension collects,
          how it is used, and how it is stored. We do not sell, share, or rent your data to any third party.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Data We Collect</h2>
        <p style={{ marginBottom: 12 }}>The Extension collects and transmits the following data:</p>
        <ul style={{ paddingLeft: 24, display: "flex", flexDirection: "column", gap: 10 }}>
          <li>
            <strong>API Key.</strong> A personal API key that authenticates you to the FIA Academy Toolkit
            server. This key is stored locally in <code>chrome.storage.local</code> on your device and is
            sent with every request to the Toolkit server. It is never shared with any third party.
          </li>
          <li>
            <strong>DMO Activity Logs.</strong> When you log Daily Method of Operation (DMO) activities,
            those entries are sent to and stored on the FIA Academy Toolkit server associated with your
            account.
          </li>
          <li>
            <strong>Affiliate &amp; Resource Links.</strong> Links you manage through the Extension are
            stored on the FIA Academy Toolkit server and synced to your account.
          </li>
          <li>
            <strong>Swipe File Captures.</strong> Screenshots you take of browser tabs, text snippets you
            clip via right-click, and full-page captures submitted by URL are uploaded to and stored on the
            FIA Academy Toolkit server under your account. You control whether individual items are shared
            publicly via a share link.
          </li>
          <li>
            <strong>Page URL &amp; Title.</strong> When you capture a screenshot, the URL and title of
            the active browser tab are read solely to pre-fill a title field and record the source of the
            capture. This information is only used locally in the popup and, if saved, stored as part of
            your Swipe File entry.
          </li>
          <li>
            <strong>Selected Text.</strong> When you use the right-click "Save to Swipe File" context
            menu on a text selection, the selected text is sent to the FIA Academy Toolkit server and
            stored as a snippet in your Swipe File.
          </li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>How We Use Your Data</h2>
        <ul style={{ paddingLeft: 24, display: "flex", flexDirection: "column", gap: 8 }}>
          <li>To provide and operate the features of the Extension and the FIA Academy Toolkit platform.</li>
          <li>To authenticate your account and ensure only authorized members can access the Toolkit.</li>
          <li>To store your activity logs, links, and Swipe File captures in your personal account.</li>
          <li>To display your data back to you within the Extension and on the FIA Academy Toolkit website.</li>
        </ul>
        <p style={{ marginTop: 12 }}>
          We do not use your data for advertising, profiling, or any purpose beyond operating the Toolkit.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Data Storage &amp; Security</h2>
        <p>
          Your API key is stored locally on your device using Chrome's built-in <code>chrome.storage.local</code>
          API. All other data is stored on our servers hosted on Google Cloud infrastructure. Data in transit
          is encrypted via HTTPS. We follow industry-standard security practices to protect your information.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Permissions Used</h2>
        <ul style={{ paddingLeft: 24, display: "flex", flexDirection: "column", gap: 8 }}>
          <li><strong>storage</strong> — stores your API key and settings locally on your device.</li>
          <li><strong>activeTab / tabs</strong> — reads the URL and title of the current tab when you initiate a screenshot capture. The Extension does not access tab content passively.</li>
          <li><strong>contextMenus</strong> — adds a "Save to Swipe File" option when you right-click selected text. The Extension only reads the selected text when you explicitly invoke this menu item.</li>
          <li><strong>notifications</strong> — displays a confirmation notification after a snippet is saved via right-click.</li>
          <li><strong>alarms</strong> — powers timed reminders and DMO tracking features.</li>
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Third Parties</h2>
        <p>
          The Extension communicates exclusively with the FIA Academy Toolkit server
          (<strong>toolkit.fearlessmarketinglab.com</strong>). No data is sent to any advertising network,
          analytics provider, or other third party.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Data Deletion</h2>
        <p>
          You can remove your locally stored API key at any time by clicking "Disconnect &amp; clear all data"
          in the Extension's Settings panel. To request deletion of your account data from our servers,
          contact FIA Academy support.
        </p>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Changes to This Policy</h2>
        <p>
          We may update this policy as the Extension evolves. The "last updated" date at the top of this
          page reflects the most recent revision. Continued use of the Extension after changes are posted
          constitutes acceptance of the updated policy.
        </p>
      </section>

      <section>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Contact</h2>
        <p>
          Questions about this policy? Reach out through the FIA Academy member support channels.
        </p>
      </section>

      <hr style={{ marginTop: 48, border: "none", borderTop: "1px solid #e5e5e5" }} />
      <p style={{ fontSize: 13, color: "#999", marginTop: 16 }}>
        © {new Date().getFullYear()} FIA Academy · FIA Academy Toolkit
      </p>
    </div>
  );
}
