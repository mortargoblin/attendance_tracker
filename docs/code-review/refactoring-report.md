# Refactoring Report (small clean-up)

## Fix 1: unhandled promises in `client/js/router.js` 

- `logout()` in the logout button handler now has `.catch(console.error)`.
- Both `route()` calls (after a language change and on page load) now have `.catch(console.error)`.
- Behaviour is unchanged. Errors that were silently lost are now logged.

## Fix 2: `formatDate` default parameter in `client/js/i18n.js` 

- The inline object default moved to the constant `DEFAULT_DATE_OPTIONS`.
- The default values are the same, so the output is unchanged.