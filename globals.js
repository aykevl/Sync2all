
var statuses = {
	READY:       0,
	AUTHORIZING: 1,
	DOWNLOADING: 2,
	MERGING:     3,
	UPLOADING:   4,
}

// make browser object if it doesn't already exist
try {
	browser;
} catch (err) {
	browser = {};
}

if (typeof chrome != 'undefined' && chrome.extension) {
	browser.name = 'chrome';
} else if (typeof (opera) != 'undefined' && opera.extension) {
	browser.name = 'opera';
} else {
	// unkonwn browser
	console.log('ERROR: browser niet herkend.');
}
