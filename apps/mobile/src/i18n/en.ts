import type { Translation } from "./core";
import type { fr } from "./fr";

/** English, typed against the French reference: a missing key fails to compile. la tour = your server. */
export const en: Translation<typeof fr> = {
  "lang.label": "Language",
  "lang.fr": "Français",
  "lang.en": "English",

  // First launch
  "setup.title": "Connect your phone to your server",
  "setup.lead": "Type the address Waysake shows on your computer (the “App” page). Tailscale needs to be running on this phone.",
  "setup.placeholder": "server.tail1234.ts.net",
  "setup.tried": "Address tried: {url}",
  "setup.connect": "Connect",
  "setup.who": "Who's this?",
  "setup.remember": "Waysake will remember it on this phone.",

  // Household password (WAYSAKE_PASSWORD)
  "setup.password.title": "Password",
  "setup.password.lead": "Your server is protected. Type your household password: Waysake will remember it on this phone.",
  "setup.password.label": "Household password",
  "setup.password.continue": "Continue",
  "setup.password.wrong": "That's not the right password.",
  "password.needed": "Your server needs the household password (or it has changed). Open Waysake settings to enter it.",

  // Waysake in the WebView
  "waysake.down.title": "Your server isn't answering",
  "waysake.down.text": "Check that Tailscale is running on this phone and that your server is on.",
  "waysake.down.address": "Address: {url}",
  "waysake.retry": "Try again",
  "waysake.changeAddress": "Change address",

  // Import
  "import.title": "Import",
  "import.close": "Close",
  "import.denied.title": "Waysake can't see your photos",
  "import.denied.text": "Allow “Photos and videos” (full access) in settings, so Waysake can find your trips with their places.",
  "import.openSettings": "Open settings",
  "import.choose": "Which photos should go to your server? Waysake sorts them, then you check.",
  "import.firstDay": "First day",
  "import.lastDay": "Last day",
  "import.scanning": "Looking for photos {range}…",
  "import.found": { one: "{count} found", other: "{count} found" },
  "import.error.title": "That didn't work",
  "import.restart": "Start over",
  "import.none": "No photos {range}",
  "import.otherPeriod": "Pick another period",
  "import.photosAndVideos": "{photos} and {videos}",
  "import.photosFound": { one: "photo found", other: "photos found" },
  "import.skipKnown": "{range}. Anything already in Waysake will be skipped.",
  "import.send": "Send to Waysake",
  "import.changePeriod": "Change period",
  "import.progress": "{done} of {total}",
  "import.duplicates": { one: ", {count} already in Waysake", other: ", {count} already in Waysake" },
  "import.keepOpen": "Keep Waysake open while it sends.",
  "import.failed": { one: "{count} file couldn't be sent ({error}).", other: "{count} files couldn't be sent ({error})." },
  "import.retry": "Try again",
  "import.continue": "Continue without them",
  "count.photos": { one: "{count} photo", other: "{count} photos" },
  "count.videos": { one: "{count} video", other: "{count} videos" },

  // Periods
  "period.sinceLast": "Since your last import",
  "period.sinceLast.sub": "After {date}",
  "period.last30": "The last 30 days",
  "period.last30.sub": "Since {date}",
  "period.thisMonth": "This month",
  "period.thisMonth.sub": "Since {month} 1",
  "period.custom": "Choose dates",
  "period.custom.sub": "A specific trip, for example",
  "period.range": "from {from} to {to}",

  // Errors
  "api.unreachable": "Your server isn't answering. Check that Tailscale is connected on your phone.",
  "api.status": "Your server answered {status}.",
  "api.profile_required": "Pick your profile first.",
  "api.not_found": "Not found.",
  "api.invalid_request": "Invalid request.",
  "api.server_error": "Your server couldn't finish. Try again in a moment.",
  "api.file_too_large": "File too large (2 GB max).",
  "api.file_too_large_named": "File too large (2 GB max): {file}",
  "api.unsupported_format": "Format not supported: {file}",
  "api.unsupported_type": "This file type isn't supported.",
  "api.unreadable_image": "This image couldn't be read.",
  "api.no_file": "No file.",
  "api.import_not_found": "This import doesn't exist.",
  "api.import_closed": "This import is finished or no longer exists.",
  "api.too_many_attempts": "Too many tries. Try again in {seconds}s.",
};
