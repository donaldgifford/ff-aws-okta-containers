# Manual checklist

Run this before a release, and after any change to how requests are handled.
The automated checks come first; this list covers what they cannot.

Items marked **(real)** need a real AWS access portal or Okta tenant that you
can sign in to. Nothing automated covers them. The rest were also checked
once against a headless Firefox while the extension was being built
([IMPL-0002](../docs/impl/0002-build-the-aws-and-okta-admin-containers-extension.md)),
but are quick to see for yourself.

> [!IMPORTANT]
> This repository is public. When you write up a problem, never paste real
> account IDs, account names, role names, portal addresses, Okta tenant
> names, tokens or cookies. Describe what you saw with placeholders.

## Before you start

```sh
just check   # lint, types, unit tests, source checks
just smoke   # loads the extension in headless Firefox
```

Then load the extension:

1. Open `about:debugging#/runtime/this-firefox`.
2. Choose **Load Temporary Add-on…** and pick `extension/manifest.json`.
3. Pin the toolbar button if it is hidden in the extensions menu.

To watch what the background script logs, choose **Inspect** next to the
extension on that page. It logs failures only, and never a URL, a response
or a token.

`just ext-run` starts a separate Firefox with a throwaway profile instead,
which is useful for a clean run but has none of your sessions.

## 1. Install and enrol

- [ ] On a fresh install, the add-on manager (`about:addons`, the extension,
      **Permissions**) shows no site access.
- [ ] Open a portal that is not enrolled. Nothing happens: it stays in its
      ordinary tab.
- [ ] Click the toolbar button on that tab. The options page opens with the
      portal's address filled in, the label empty and a region to choose.
- [ ] Choose the region and a label. The form lists exactly two addresses:
      the portal's and `portal.sso.<region>.amazonaws.com`.
- [ ] Click **Add**. Firefox's prompt names those two hosts and nothing else.
- [ ] Decline the prompt. Nothing is saved and the list is unchanged.
- [ ] Click **Add** again and allow. The portal appears in the list as
      **Access granted**, and the tab you started from reopens in a new
      container named `<label> portal`.
- [ ] Click the toolbar button on an Okta admin console
      (`<org>-admin.okta.com`) that is not enrolled. The form has the address
      and a suggested label, and lists one address: the admin host.
- [ ] Add it. The add-on manager now shows exactly the three addresses.
- [ ] In the add-on manager, switch one of the addresses off. The options
      page marks that organization **Needs access**. **Grant access again**
      restores it.

## 2. AWS consoles

- [ ] **(real)** In the portal, click a role. The console opens signed in,
      in a new tab, in a container named `<account>(<label>) / <role>`. The
      short-lived tab the portal opened closes; the portal tab stays.
- [ ] **(real)** The first time, the container may be named with the account
      ID. Once the portal has shown its account list, it is renamed with the
      account name.
- [ ] **(real)** Click a role in a second account. Both consoles stay signed
      in, side by side, in different containers.
- [ ] **(real)** Click the first role again. A second tab opens in the same
      container; no new container is created.
- [ ] **(real)** Open a bookmarked shortcut link
      (`…/start/#/console?account_id=…&role_name=…`). It behaves like a
      click, and a `destination` in the link is honoured.
- [ ] **(real)** Close the extension's inspector, leave Firefox alone for a
      minute so the background script stops, then click a role. It still
      opens in its container.
- [ ] **(real)** Change the portal to a wrong region on the options page and
      click a role. The console opens in the portal's container instead,
      and within a few seconds the toolbar button shows a `!` badge whose
      tooltip says the region may be wrong. Opening the options page shows
      the same message and clears the badge. Change the region back.
- [ ] **(real)** Switch **AWS consoles** off. A role click opens the console
      the way the portal does on its own. Switch it back on.

## 3. Portals and Okta admin consoles

- [ ] Type an enrolled portal's address into a new tab. It opens in the
      portal's container and the empty tab closes.
- [ ] Do the same with an enrolled Okta admin address. It opens in
      `<label> okta admin`.
- [ ] **(real)** Sign-in completes inside each container, including the
      redirect through `<org>.okta.com` and back.
- [ ] **(real)** With two Okta tenants and two portals enrolled, all four
      stay signed in at once.
- [ ] Open `<org>.okta.com` (not `-admin`). It is not moved.
- [ ] **(real)** From an ordinary tab on the Okta dashboard, click the tile
      that launches the AWS access portal. The portal opens in its
      container.
- [ ] Follow a link to an enrolled address from a page you were reading. The
      new tab is in the container, and the page you were reading is still
      there.
- [ ] Open an enrolled portal from a tab that is already in some other
      container. It stays in that container.
- [ ] Open an enrolled address in a private window. It is not moved.
- [ ] Switch all three kinds off under **Behaviour**. Nothing is moved or
      intercepted. Switch them back on.

## 4. Options page

- [ ] Edit an organization's label and save. Its containers are renamed in
      place; the number of containers does not change.
- [ ] Change a name template. The preview follows as you type, an unknown
      token such as `{nope}` is refused, and saving renames the containers.
- [ ] Rename a managed container in Firefox's own settings. On the options
      page it is marked **Renamed by hand**, and saving a template no longer
      changes it. **Let the extension name it again** restores its name.
- [ ] Add a colour rule, move it to the top and save. Matching containers
      change colour and keep their names.
- [ ] Close every tab in one managed container, then use **Find containers
      with no open tabs**. Only that container is listed. **Cancel** removes
      nothing; **Remove them** removes it, and it is created again the next
      time it is needed.
- [ ] **Export settings**. The file has no `cookieStoreId`, account ID or
      account name in it.
- [ ] Import a file that is not an export, and an export edited to say
      `"schemaVersion": 99`. Each is refused with a reason and nothing
      changes.
- [ ] Remove an organization, then import your export. The organization is
      back, marked **Needs access**, and one click on **Grant access to all
      of them** restores it.
- [ ] The page is readable in Firefox's light and dark themes, and every
      control can be reached and used from the keyboard alone.

## 5. After a Firefox restart

A temporary add-on is unloaded when Firefox quits.

- [ ] Quit Firefox, start it, and load the extension again from
      `about:debugging`. The organizations, their access, the templates and
      the managed containers are all as you left them, and the sessions
      inside the containers are still signed in.
- [ ] Open an enrolled address. It is routed at once.

## 6. Removing it

- [ ] Remove every organization on the options page. The add-on manager
      shows no site access.
- [ ] Remove the extension. The containers it created remain, with their
      sessions, and can be deleted in Firefox's settings under **Tabs**,
      **Manage Containers**.
