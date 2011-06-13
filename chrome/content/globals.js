
// make this extension's object if it doesn't already exist
if (!this.Sync2all) {
	this.Sync2all = {};

	Sync2all.statuses = {
		READY:       0,
		AUTHORIZING: 1,
		DOWNLOADING: 2,
		MERGING:     3,
		UPLOADING:   4,
	}

	Sync2all.browser = {};
	if (typeof chrome != 'undefined' && chrome.extension) {
		Sync2all.browser.name = 'chrome';
	} else if (typeof (opera) != 'undefined' && opera.extension) {
		Sync2all.browser.name = 'opera';
	} else if (Components && Components.classes) {
		Sync2all.browser.name = 'firefox';
	} else {
		// unkonwn browser
		console.log('ERROR: browser niet herkend.');
	}
}

