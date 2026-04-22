function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  
  // Define headers in the order they appear in your CSV/JSON
  var headers = ["Company Name", "Country", "Email ID", "Mobile Number", "Industry", "Website"];
  
  // Check if headers exist, if not, add them
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }
  
  // Prepare row data
  var row = [
    data["Company Name"],
    data["Country"],
    data["Email ID"],
    data["Mobile Number"] || "N/A",
    data["Industry"],
    data["Website"]
  ];
  
  sheet.appendRow(row);
  
  return ContentService.createTextOutput(JSON.stringify({"status": "success"})).setMimeType(ContentService.MimeType.JSON);
}
