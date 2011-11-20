
var statuses = {
	READY:       0,
	AUTHORIZING: 1,
	DOWNLOADING: 2,
	PARSING:     3,
	MERGING:     4,
	UPLOADING:   5,
}

var browser = {};
if (typeof chrome != 'undefined' && chrome.extension) {
	browser.name = 'chrome';
} else if (typeof (opera) != 'undefined' && opera.extension) {
	browser.name = 'opera';
} else if (Components && Components.classes) {
	browser.name = 'firefox';
} else {
	// unkonwn browser
	console.log('ERROR: browser niet herkend.');
}


// global variables about the popup
if (browser.name == 'firefox') {
	// window of popup
	var current_window;
	var current_document;
	// load FUEL
	var Application = Components.classes["@mozilla.org/fuel/application;1"].getService(Components.interfaces.fuelIApplication);
	var IOService   = Components.classes["@mozilla.org/network/io-service;1"].getService(Components.interfaces.nsIIOService);
} else if (browser.name == 'opera') {
	var popup_port;
}
var is_popup_open = false;
var update_batch = false;

var debug = false;

