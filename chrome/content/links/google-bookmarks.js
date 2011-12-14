
// prefix: gbm (Google BookMarks)

/*
See http://www.mmartins.com/mmartins/googlebookmarksapi/
for details of the Google Bookmarks API
*/

var gbm = {};

gbm.name = 'Google Bookmarks';
gbm.shortname = 'gbm';


/* imports */

import_link(gbm);
import_rqueue(gbm);


/* constants */

gbm.api_url = 'https://www.google.com/bookmarks/mark';
gbm.labels;         // kind of label cache
// Copied from GMarks, from the top of the file components/nsIGmarksCom_google.js
gbm.BKMKLET_URL = "https://www.google.com/bookmarks/find?q=javascript&src=gmarksbkmklet";
// whether or not this link has it's own data structures and needs to be
// notified of changes that it has posted itself
gbm.has_own_data = true;


// set default options
// TODO maybe in a separate function?
gbm.defaults = {
	'gbm_rootNodeLabel': 'Bookmarks Bar',
	'gbm_folderSep':     '/',
	'gbm_lastSync':      0,
}
var default_key;
for (default_key in gbm.defaults) {
	if (localStorage[default_key] === undefined ||
		localStorage[default_key] === null) {
		localStorage[default_key] = gbm.defaults[default_key];
	}
}


gbm._init = function (enable) {
	gbm.rootNodeLabel = localStorage['gbm_rootNodeLabel'];
	gbm.folderSep     = localStorage['gbm_folderSep'];
	gbm.lastSync      = localStorage['gbm_lastSync'];
};

// (re) start
gbm.start = gbm.msg_start = function () {

	if (gbm.status) return; // FIXME error handling

	// mark enabled
	if (!gbm.enabled) { // not needed for gbm? strange...
		gbm.enable(); // doesn't do anything when already enabled
		return;
	}

	// set status
	gbm.updateStatus(statuses.DOWNLOADING);

	// initialize variables
    gbm.bookmarks = {title: gbm.rootNodeLabel, bm: {}, f: {}};
	gbm.urls      = {}; // dictionary: url => list of bookmarks
	gbm.labels    = {};
	gbm.changed   = {}; // marked to be uploaded
	gbm.actions   = [];
	gbm.cbl_ids   = {}; // current browser IDs
	// will be set to false once the status has been saved
	gbm.initial_commit = true;

	// start download
	gbm.reqXml = new XMLHttpRequest();
	gbm.reqXml.open (
				"GET",
				"https://www.google.com/bookmarks/?zx="+(new Date()).getTime()+"&output=xml&num=10000",
				true);
	gbm.reqXml.onreadystatechange = gbm.onXmlLoaded;
	gbm.reqXml.send(null);
}

gbm.finished_start = function () {

	if (!gbm.enabled) {
		// something went wrong, for example, wrong authentication
		return;
	}

	if (!has_contents(gbm.bookmarks)) {
		if (confirm('Are you sure you want to remove all bookmarks?')) {
			return;
		}
	}

	// get actions
	if (localStorage['gbm_state']) {
		try {
			gbm.calculate_actions(JSON.parse(localStorage['gbm_state']), gbm.bookmarks); // yes, gbm.bookmarks
			if (gbm.actions.length) {
				console.log('gbm actions:');
				console.log(gbm.actions);
			}
		} catch (err) {
			console.log('gbm: error while calculating actions:');
			console.log(err);
			// bookmarks will just be merged, so no real harm done. You will only get duplicates...
		}
	}

	// set status
	gbm.updateStatus(statuses.MERGING);

	// update data to use the browser objects
	gbm.update_data();

	// send 'finished' signal
	link_finished(gbm);

	// set status (again)
	gbm.updateStatus(statuses.READY);
};

/*gbm.get_cbl_ids = function (folder) {
	gbm.cbl_ids[folder.id] = folder;
	for (url in folder.bm) {
		gbm.cbl_ids[folder.bm[url].id] = folder.bm[url];
	}
	for (title in folder.f) {
		gbm.get_cbl_ids(folder.f[title]);
	}
}*/

/*gbm.use_global_urls = function (folder) {
	for (url in folder.bm) {
		gbm.added_bookmark(folder.bm[url]);
	}
	for (title in folder.f) {
		gbm.use_global_urls(folder.f[title]);
	}
}*/

gbm.update_data = function () {
	console.log('gbm: updating data structures...');
	gbm.update_urls(g_bookmarks);
};
gbm.update_urls = function (folder) {
	var url;
	for (url in folder.bm) {
		gbm.added_bookmark(folder.bm[url]);
	}
	var title;
	for (title in folder.f) {
		gbm.update_urls(folder.f[title]);
	}
};

// the (re)synchronisation has finished (all bookmarks are merged,
// committing is in progress)
gbm.finished_sync = function () {

	// clear unused memory
	delete gbm.bookmarks;
	delete gbm.cbl_ids; // this MUST be deleted when the sync has finished
	delete gbm.labels;
};

gbm.save_state = function () {
	var state = {bm: [], f: {}};
	gbm.get_state(state, g_bookmarks);
	localStorage['gbm_state'] = JSON.stringify(state);
};

gbm.get_state = function (state, folder) {
	state.id = folder.id;
	var url;
	for (url in folder.bm) {
		state.bm.push(folder.bm[url].id+'\n'+url);
	}
	var title;
	for (title in folder.f) {
		state.f[title] = {bm: [], f: {}};
		gbm.get_state(state.f[title], folder.f[title]);
	}
};

gbm.calculate_actions = function (state, folder) {
	// only look for removed bookmarks, not for added bookmarks (and moved bookmarks are 'removed' and 'added', TODO fix in a future version, this should 'just work').
	var data = undefined;
	var id, url;
	for (var i=0; data=state.bm[i]; i++) {

		data = data.split('\n');
		id = data[0]; url = data[1];

		if (!folder.bm[url]) {
			// this bookmark has been removed
			// Ignore already removed bookmarks.
			if (browser.ids[id]) {
				console.log('Bookmark deleted: '+url);
				gbm.actions.push(['bm_del', id]);
			}
		}
	}
	var title;
	for (title in state.f) {
		var substate = state.f[title];
		if (!folder.f[title]) {
			// if this is true, the folder has been moved or renamed and the
			// browser link should take care of it.
			if (browser.ids[substate.id]) continue;

			// if this folder exists in the browser...
			if (browser.ids[substate]) {
				// mark all bookmarks inside it as deleted, and mark all folders as
				// 'delete-if-empty'
				gbm.mark_state_deleted(substate);
			}

			// don't recurse, because folder.f[title] doesn't exist
			// (browser.ids[substate.id] can't be used because
			// folder.f[title] is part of gbm.bookmarks
			continue;
		}
		gbm.calculate_actions(substate, folder.f[title]);
	}
}


gbm.onXmlLoaded = function () {
	if (gbm.reqXml.readyState != 4) return;

	// finished loading

	if (gbm.reqXml.status != 200) {
		alert('Failed to retrieve bookmarks (XML). Is there an internet connection?');
	} else {
		// parse XML.
		if (gbm.parseXmlBookmarks(gbm.reqXml.responseXML)) {
			// something went wrong
			return;
		}

		// XML parsing finished successfully, so download RSS now (for the signature)
		gbm.reqRss = new XMLHttpRequest();
		gbm.reqRss.open("GET", "https://www.google.com/bookmarks/?zx="+(new Date()).getTime()+"&output=rss&num=1&start=0", true); // will always give at least 25 bookmarks
		gbm.reqRss.onreadystatechange = gbm.onRssLoaded;
		gbm.reqRss.send(null);
	}
}

// parse the XML Google Bookmarks. Return true when there is an error.
gbm.parseXmlBookmarks = function (xmlTree) {
	try {
		var google_bookmarks = xmlTree.childNodes[0].childNodes[0].childNodes;
	} catch (err) {
		gbm.disable();
		alert("Failed to parse bookmarks ("+err+") -- are you logged in?\nGoogle Bookmarks link is now disabled.");
		return true;
	}

	var bm_elements = xmlTree.getElementsByTagName('bookmarks')[0].getElementsByTagName('bookmark');
	var bm_element;
	for (var i=0; bm_element=bm_elements[i]; i++) {
		if (!bm_element.getElementsByTagName('title').length) {
			// bookmark may have no title
			var title = undefined;
		} else {
			var title =          bm_element.getElementsByTagName('title'    )[0].firstChild.nodeValue;
		}
		var url       =          bm_element.getElementsByTagName('url'      )[0].firstChild.nodeValue;
		url = url.replace(/ /g, '%20');
		var timestamp = parseInt(bm_element.getElementsByTagName('timestamp')[0].firstChild.nodeValue)/1000; // same kind of value as returned by (new Date()).getTime();
		var id        =          bm_element.getElementsByTagName('id'       )[0].firstChild.nodeValue;

		// this one IS important
		// This saves the ID, the rest comes later in gbm.update_data().
		// That function uses bookmarks objects from g_bookmarks.
		gbm.urls[url] = [];
		gbm.urls[url].id = id;

		var label_element;
		var label_elements = bm_element.getElementsByTagName('label');
		for (var j=0; label_element=label_elements[j]; j++) {
			var label = label_element.childNodes[0].nodeValue;
			var folder = undefined;
			if (label == gbm.rootNodeLabel) {
				folder = gbm.bookmarks;
			} else {
				if (!gbm.labels[label]) {
					// Add the new folder to the list
					var elements = label.split(gbm.folderSep);
					folder = gbm.bookmarks;
					var element;
					for (var i_element=0; element=elements[i_element]; i_element++) {
						// is this a new directory?
						if (folder.f[element] == undefined) {
							// yes, create it first
							folder.f[element] = {bm: {}, f: {}, title: element,
								parentNode: folder};
						}
						// folder does exist
						folder = folder.f[element];
					}
					gbm.labels[label] = folder;
				} else {
					folder = gbm.labels[label];
				}
			}
			var bookmark = {url: url, title: title, parentNode: folder,
				timestamp: timestamp};
			folder.bm[bookmark.url] = bookmark;
		}
		if (!label_elements.length) {
			// this bookmark has no labels, add it to root
			var bookmark = {url: url, title: title, parentNode: gbm.bookmarks,
				timestamp: timestamp};
			gbm.bookmarks.bm[url] = bookmark;
		}
	}
}

/* RSS doesn't seem to be needed, because javascript bookmarklets
 * now seem to be accepted by Google... Don't know why they always disabled
 * them. */
/* TODO: use RSS for the descriptions of bookmarks */

gbm.onRssLoaded = function () {
	if (gbm.reqRss.readyState != 4) return;

	// readyState = 4
	gbm.updateStatus(statuses.PARSING);

	if (gbm.reqRss.status != 200) {
		alert('Failed to retrieve bookmarks (RSS). Is there an internet connection?');
		console.log(gbm.reqRss);
	} else {
		gbm.parseRssBookmarks(gbm.reqRss.responseXML);
		gbm.finished_start();
	}
}

// TODO
gbm.parseRssBookmarks = function (xmlTree) {
	try {
		var channel = xmlTree.firstChild.firstChild;
		var sig_element = channel.getElementsByTagName('signature')[0] ||
			channel.getElementsByTagName('smh:signature')[0]; // firefox
		gbm.sig     = sig_element.firstChild.nodeValue;
	} catch (err) {
		alert("Failed to parse bookmarks ("+err+") -- are you logged in?");
		return;
	}
	/*var element;
	var elements = channel.getElementsByTagName('item');
	for (var i=0; element=elements[i]; i++) {
		var isbkmk = element.getElementsByTagName('bkmk')[0];
		if (!(isbkmk && isbkmk.firstChild.nodeValue == 'yes')) {
			//console.log(isbkmk);
			continue;
		}
		try {
			var url = element.getElementsByTagName('link' )[0].firstChild.nodeValue;
		} catch (err) {
			//console.log('isbkmk:');
			//console.log(isbkmk.firstChild.nodeValue);
			//console.log(element.getElementsByTagName('link' )[0]);
		}
	}*/
}

gbm.added_bookmark = function (bm) {
	if (!gbm.urls[bm.url]) {
		gbm.urls[bm.url] = [];
	}
	gbm.urls[bm.url].push(bm);
}

// check for things that will be modified by Google. Change the url of the
// bookmark and notify other links.
gbm.check_mods = function (bookmark) {
	if (bookmark.url.substr(-1) == '#') {
		// google doesn't allow URLs with only a hash on the end
		var oldurl = bookmark.url;
		bookmark.url = bookmark.url.substr(0, bookmark.url.length-1);
		call_all('bm_mod_url', gbm, [bookmark, oldurl]);
	}
}


gbm.bm_add = function (target, bookmark) {

	// check for things that will be changed by Google
	gbm.check_mods(bookmark);

	// add to gbm.urls
	gbm.added_bookmark(bookmark);

	// if this is a known change
	if (target == gbm) return;

	gbm.changed[bookmark.url] = bookmark;
	
};

gbm.bm_del = function (target, bookmark) {

	// get all bookmarks with this url
	var gbookmark = gbm.urls[bookmark.url];

	// delete this label
	Array_remove(gbookmark, bookmark);

	// if this is a known change
	if (target == gbm) return;

	// if there are no labels left (most often: yes, because most often
	// bookmarks have only one label)
	gbm.changed[bookmark.url] = bookmark;
}

gbm.f_add = false; // doesn't need implementing

gbm.f_del = function (target, folder) {
	// if this is a known change
	if (target == gbm) return;

	var url;
	for (url in folder.bm) {
		gbm.bm_del(target, folder.bm[url]);
	}
	var title;
	for (title in folder.f) {
		gbm.f_del(target, folder.f[title]);
	}
};

gbm.bm_mv = function (target, bm, oldParent) {
	// if this is a known change
	if (target == gbm) return;

	gbm.changed[bm.url] = bm;
}

gbm.f_mv = function (target, folder, oldParent) {
	// if this is a known change
	if (target == gbm) return;

	gbm.upload_all(folder); // FIXME there is a better way, see below, but it doesn't work. Make it work.
	/*
	var oldlabel = oldParent == g_bookmarks ? folder.title : gbm.folder_get_label(oldParent)+gbm.folderSep+folder.title;
	var labels = oldlabel+','+gbm.folder_get_label(folder);
	gbm.add_to_queue({op: 'modlabel', labels: labels});*/
};

gbm.bm_mod_title = function (target, bm, oldtitle) {
	// if this is a known change
	if (target == gbm) return;

	gbm.changed[bm.url] = bm;
};

gbm.bm_mod_url = function (target, bm, oldurl) {
	// if this is a known change
	if (target == gbm) return;

	gbm.check_mods(bm); // TODO will upload too much data. Investigate why.

	// nearly a copy of gbm.bm_del, unfortunately
	oldgbookmark = gbm.urls[oldurl];
	Array_remove(oldgbookmark, bm);
	if (!oldgbookmark.length) {
		gbm.delete_bookmark(oldgbookmark.id);
	} else {
		gbm.changed[oldurl] = gbm.changed[oldurl] || oldgbookmark[0]; // choose one at random
	}

	gbm.bm_add(target, bm);
};

// title changed
gbm.f_mod_title = function (target, folder, oldtitle) {
	// if this is a known change
	if (target == gbm) return;

	gbm.upload_all(folder);
};

// do an upload (for when an bookmark has been created/updated/label deleted)
// this needs a bookmark object because it uploads the latest title of the bookmark
gbm.upload_bookmark = function (bookmark) {
	console.log('gbm: upload_bookmark');
	var labels = gbm.bookmark_get_labels(bookmark.url);
	gbm.add_to_queue({bkmk: bookmark.url, title: bookmark.title, labels: labels},
			function (request) {
				gbm.urls[bookmark.url].id = request.responseText;
			});
};

// this doesn't need a dictionary of changes, because they will be removed anyway
gbm.delete_bookmark = function (id) {
	console.log('gbm: delete_bookmark');
	gbm.add_to_queue({dlq: id});
};

gbm.upload_all = function (folder) {
	var url;
	for (url in folder.bm) {
		gbm.changed[url] = folder.bm[url];
	}
	var title;
	for (title in folder.f) {
		gbm.upload_all(folder.f[title]);
	}
};

gbm.commit = function () {
	var has_changes = false;
	var url;
	for (url in gbm.changed) {
		has_changes = true;

		var gbookmark = gbm.urls[url];
		if (!gbookmark.length) {
			// no labels, delete this bookmark
			gbm.delete_bookmark(gbookmark.id);
		} else {
			// has still at least one label, upload  (changing the
			// bookmark).
			gbm.upload_bookmark(gbm.changed[url]);
		}
	}
	if (!has_changes && gbm.initial_commit) {
		gbm.may_save_state();
	}
	gbm.changed = {};
};

gbm.add_to_queue = function (params, callback) {
	params.zx   = new Date().getTime();
	if (!gbm.sig) {
		alert('No signature for Google Bookmarks (bug)!');
		console.error('No signature for Google Bookmarks (bug)!');
	}
	params.sig  = gbm.sig;
	params.prev = '';
	gbm.r_queue_add(gbm.api_url, params, callback);
}

gbm.bookmark_get_labels = function (url) {
	if (!gbm.urls[url] || gbm.urls[url].length == 0) {
		// no labels
		return false;
	}
	var folder;
	var labels = '';
	var label;
	var gbookmark;
	for (var i=0; gbookmark=gbm.urls[url][i]; i++) {
		var folder = gbookmark.parentNode;
		if (!folder) {
			throw 'undefined folder, bm url='+url;
		}
		if (folder == g_bookmarks) {
			label = gbm.rootNodeLabel;
		} else {
			label = gbm.folder_get_label(folder);
		}
		labels = labels+((labels=='')?'':',')+label;
	}
	if (labels == gbm.rootNodeLabel) {
		labels = '';
	}
	return labels;
};

gbm.folder_get_label = function (folder) {
	if (!folder.parentNode) return gbm.rootNodeLabel;
	var label = '';
	while (true) {
		label = folder.title+(label.length?gbm.folderSep:'')+label;
		folder = folder.parentNode;
		if (!folder || !folder.parentNode) break; // first check introduced for bug when a bookmark is added to the Bookmarks Bar.
	}
	return label;
}


