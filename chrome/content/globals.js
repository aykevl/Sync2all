
var statuses = {
	READY:       0,
	AUTHORIZING: 1,
	DOWNLOADING: 2,
	MERGING:     3,
	UPLOADING:   4,
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
