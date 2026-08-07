/**
 * Homigo — Google Form → POST /api/workers/import
 *
 * Script Properties (Project Settings):
 *   HOMIGO_API_URL       = https://YOUR_PUBLIC_DOMAIN/api/workers/import
 *   HOMIGO_IMPORT_SECRET = same value as WORKERS_IMPORT_SECRET in .env.local / Vercel
 *
 * IMPORTANT: HOMIGO_API_URL must be publicly reachable.
 * Google Apps Script CANNOT call http://localhost — use ngrok or your deployed URL.
 *
 * Setup:
 *   1. Paste as Code.gs in the Form's Script editor
 *   2. Set Script Properties above
 *   3. Run setupHomigoTrigger once
 *   4. Run testHomigoImport to verify
 */

/** Exact Google Form question titles → API payload keys */
var FORM_FIELD_KEYS = {
  "Full Name": "Full Name",
  Gender: "Gender",
  "Mobile Number": "Mobile Number",
  "Service Type": "Service Type",
  Qualification: "Qualification",
  "Experience Years": "Experience Years",
  Area: "Area",
  Pincode: "Pincode",
  "Preferred Timing": "Preferred Timing",
  "Full Address": "Full Address",
  "Preferred Language": "Preferred language",
  "Alternate Mobile": "Alternate mobile",
  "Alternate mobile": "Alternate mobile",
  "Aadhaar Upload": "Aadhaar Upload",
  "Address Proof Upload": "Address Proof Upload",
  "Photo Upload": "Photo Upload",
  "Police Verification Upload": "Police Verification Upload",
  "Certificate Document Upload": "Certificate Document Upload",
};

function getHomigoConfig_() {
  var props = PropertiesService.getScriptProperties();
  var apiUrl = props.getProperty("HOMIGO_API_URL");
  var importSecret = props.getProperty("HOMIGO_IMPORT_SECRET");

  if (!apiUrl || !importSecret) {
    throw new Error(
      "Missing Script Properties. Set HOMIGO_API_URL and HOMIGO_IMPORT_SECRET.",
    );
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(apiUrl)) {
    throw new Error(
      "HOMIGO_API_URL cannot be localhost. Google Apps Script runs on Google's servers and cannot reach your local machine. Use your deployed URL (e.g. https://your-app.vercel.app/api/workers/import) or an ngrok tunnel.",
    );
  }

  return { apiUrl: apiUrl, importSecret: importSecret };
}

/** Run once after setting Script Properties. */
function setupHomigoTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "onFormSubmit") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger("onFormSubmit")
    .forForm(FormApp.getActiveForm())
    .onFormSubmit()
    .create();

  Logger.log("Homigo form submit trigger installed.");
}

function onFormSubmit(e) {
  try {
    var payload = buildPayloadFromResponse_(e.response);
    Logger.log("Homigo payload: " + JSON.stringify(payload));
    postToHomigo_(payload);
  } catch (err) {
    console.error("Homigo import failed:", err);
    throw err;
  }
}

function buildPayloadFromResponse_(response) {
  var payload = {};
  var itemResponses = response.getItemResponses();

  for (var i = 0; i < itemResponses.length; i++) {
    var itemResponse = itemResponses[i];
    var item = itemResponse.getItem();
    var title = item.getTitle();
    var mappedKey = FORM_FIELD_KEYS[title] || title;

    if (item.getType() === FormApp.ItemType.FILE_UPLOAD) {
      var fileUrl = fileUploadToDriveUrl_(itemResponse);
      if (fileUrl) {
        payload[mappedKey] = fileUrl;
      }
      continue;
    }

    var value = itemResponse.getResponse();
    if (value === null || value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length > 0) {
        payload[mappedKey] = value.join(", ");
      }
      continue;
    }

    var text = String(value).trim();
    if (text !== "") {
      payload[mappedKey] = text;
    }
  }

  return payload;
}

/** Convert Google Form file-upload response → public Drive view URL */
function fileUploadToDriveUrl_(itemResponse) {
  var response = itemResponse.getResponse();
  if (!response) {
    return null;
  }

  var fileIds = Array.isArray(response) ? response : [String(response)];
  if (fileIds.length === 0) {
    return null;
  }

  var fileId = String(fileIds[0]).trim();
  if (!fileId) {
    return null;
  }

  try {
    var file = DriveApp.getFileById(fileId);
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      Logger.log("Could not set sharing on file " + fileId + ": " + shareErr);
    }
    return "https://drive.google.com/file/d/" + fileId + "/view";
  } catch (err) {
    Logger.log("DriveApp.getFileById failed for " + fileId + ": " + err);
    return "https://drive.google.com/file/d/" + fileId + "/view";
  }
}

function postToHomigo_(payload) {
  var config = getHomigoConfig_();

  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + config.importSecret,
      "X-Homigo-Secret": config.importSecret,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  var response = UrlFetchApp.fetch(config.apiUrl, options);
  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error("Homigo API " + code + ": " + body);
  }

  Logger.log("Homigo import success: " + body);
  return JSON.parse(body);
}

/** Manual test — run from Apps Script editor */
function testHomigoImport() {
  var mobile = "9" + String(Date.now()).slice(-9);
  var result = postToHomigo_({
    "Full Name": "Apps Script Test Worker",
    "Mobile Number": mobile,
    Gender: "Male",
    "Service Type": "Electrician, Plumber",
    Qualification: "ITI, Diploma",
    "Experience Years": "3",
    Area: "Pune",
    Pincode: "411001",
    "Preferred Timing": "Morning, Flexible",
    "Full Address": "Flat 12, Test Society",
    "Aadhaar Upload": "https://drive.google.com/file/d/test-aadhar/view",
    "Photo Upload": "https://drive.google.com/file/d/test-photo/view",
  });
  Logger.log(JSON.stringify(result));
}
