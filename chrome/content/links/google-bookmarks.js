
// prefix: gbm (Google BookMarks)

/*
See http://www.mmartins.com/mmartins/googlebookmarksapi/
for details of the Google Bookmarks API
*/

var gbm = {};

gbm.name = 'Google Bookmarks'; // OBSOLETE
gbm.fullName = 'Google Bookmarks';
gbm.id = 'gbm';
gbm.bookmarksRootTitle = 'Bookmarks Bar';


/* imports */

import_tagBasedLink(gbm);
import_queue(gbm);


/* constants */

gbm.api_url = 'https://www.google.com/bookmarks/mark';
// Copied from GMarks, from the top of the file components/nsIGmarksCom_google.js
gbm.BKMKLET_URL = "https://www.google.com/bookmarks/find?q=javascript&src=gmarksbkmklet";
// whether or not this link has it's own data structures and needs to be
// notified of changes that it has posted itself
gbm.has_own_data = true;


// (re) start
gbm.startSync = function () {

	// will be set to false once the status has been saved
	gbm.initial_commit = true;

	// set status and start download
	gbm.updateStatus(statuses.DOWNLOADING);
	gbm.reqXml = new XMLHttpRequest();
	gbm.reqXml.open (
				"GET",
				"https://www.google.com/bookmarks/?zx="+(new Date()).getTime()+"&output=xml&num=10000",
				true);
	gbm.reqXml.onreadystatechange = gbm.onXmlRSC;
	gbm.reqXml.send(null);
}

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
	// only look for removed bookmarks, not for added bookmarks (and moved bookmarks are 'removed' and 'added', TODO fix in a future version).
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


// RSC = ReadyStateChange
gbm.onXmlRSC = function () {
	if (gbm.reqXml.readyState != 4) return;

	// finished loading

	if (gbm.reqXml.status != 200) {
		gbm.errorStarting('Failed to retrieve bookmarks (XML). Is there an internet connection and are you logged in to Google?');
	} else {
		// parse XML.
		if (gbm.parseXmlBookmarks(gbm.reqXml.responseXML)) {
			// something went wrong
			return;
		}

		// XML parsing finished successfully, so download RSS now (for the signature)
		gbm.reqRss = new XMLHttpRequest();
		gbm.reqRss.open("GET", "https://www.google.com/bookmarks/?zx="+(new Date()).getTime()+"&output=rss&num=1&start=0", true); // will always give at least 25 bookmarks
		gbm.reqRss.onreadystatechange = gbm.onRssRSC;
		gbm.reqRss.send(null);
	}
}

// parse the XML Google Bookmarks. Return true when there is an error.
gbm.parseXmlBookmarks = function (xmlTree) {
	try {
		var google_bookmarks = xmlTree.childNodes[0].childNodes[0].childNodes;
	} catch (err) {
		gbm.errorStarting("Failed to parse bookmarks ("+err+") -- are you logged in?");
		return true;
	}

	var xmlBookmarks = xmlTree.getElementsByTagName('bookmarks')[0].getElementsByTagName('bookmark');
	var xmlBookmark;
	for (var i=0; xmlBookmark=xmlBookmarks[i]; i++) {
		if (!xmlBookmark.getElementsByTagName('title').length) {
			// bookmark may have no title
			var title = undefined;
		} else {
			var title =          xmlBookmark.getElementsByTagName('title'    )[0].firstChild.nodeValue;
		}
		var url       =          xmlBookmark.getElementsByTagName('url'      )[0].firstChild.nodeValue;
		url = url.replace(/ /g, '%20'); // Google Bookmarks is sometimes weird
		// get the timestamp in seconds, in microseconds precise.
		var timestamp = parseInt(xmlBookmark.getElementsByTagName('timestamp')[0].firstChild.nodeValue)/1000/1000;
		var id        =          xmlBookmark.getElementsByTagName('id'       )[0].firstChild.nodeValue;

		// get the tags for this bookmark
		var tags = [];
		var xmlTag;
		var xmlTags = xmlBookmark.getElementsByTagName('label');
		for (var j=0; xmlTag=xmlTags[j]; j++) {
			var tag = xmlTag.childNodes[0].nodeValue;
			tags.push(tag);
		}

		var urlBookmark = {url: url, title: title, mtime: timestamp, tags: tags, id: id};

		// import it into the tree
		gbm.importBookmark(urlBookmark);
	}
}

/* RSS doesn't seem to be needed, because javascript bookmarklets
 * now seem to be accepted by Google... Don't know why they always disabled
 * them. */
/* TODO: use RSS for the descriptions of bookmarks */

gbm.onRssRSC = function () {
	if (gbm.reqRss.readyState != 4) return;

	// readyState = 4
	gbm.updateStatus(statuses.PARSING);

	if (gbm.reqRss.status != 200) {
		gbm.errorStarting('Failed to retrieve bookmarks (RSS). Is there an internet connection?');
	} else {
		gbm.parseRssBookmarks(gbm.reqRss.responseXML);
		gbm.parsingFinished();
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
		gbm.errorStarting("Failed to parse bookmarks ("+err+") -- are you logged in?");
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

// check for things that will be modified by Google. Change the url of the
// bookmark and notify other links.
gbm.fixBookmark = function (bookmark) {
	if (bookmark.url.substr(-1) == '#') {
		// google doesn't allow URLs with only a hash on the end
		var oldurl = bookmark.url;
		bookmark.url = bookmark.url.substr(0, bookmark.url.length-1);
		broadcastMessage('bm_mod_url', gbm, [bookmark, oldurl]);
	}
}

gbm.bm_add = tagtree.bm_add;


gbm.bm_del = function (target, bookmark) {

	// get all bookmarks with this url
	var gbookmark = tagtree.urls[bookmark.url];

	// delete this label
	Array_remove(gbookmark.bm, bookmark);

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
	var oldlabel = oldParent == browser.bookmarks ? folder.title : gbm.folder_get_label(oldParent)+gbm.folderSep+folder.title;
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

	gbm.fixBookmark(bm); // TODO will upload too much data. Investigate why.

	// nearly a copy of gbm.bm_del: TODO
	oldgbookmark = tagtree.urls[oldurl];
	Array_remove(oldgbookmark.bm, bm);
	if (!oldgbookmark.bm.length) {
		gbm.delete_bookmark(oldgbookmark.gbm_id);
	} else {
		gbm.changed[oldurl] = gbm.changed[oldurl] || oldgbookmark.bm[0]; // choose one at random
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
				tagtree.urls[bookmark.url].gbm_id = request.responseText;
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

		var gbookmark = tagtree.urls[url];
		if (!gbookmark.bm.length) {
			// no labels, delete this bookmark
			gbm.delete_bookmark(gbookmark.gbm_id);
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
	gbm.queue_start();
};

gbm.add_to_queue = function (params, callback) {
	params.zx   = new Date().getTime();
	if (!gbm.sig) {
		alert('No signature for Google Bookmarks (bug)!');
		console.error('No signature for Google Bookmarks (bug)!');
	}
	params.sig  = gbm.sig;
	params.prev = '';
	gbm.queue_add(function (dict_params) {
				var req = new XMLHttpRequest();
				req.open("POST", gbm.api_url, true);
				var params = '';
				var key;
				for (key in dict_params) {
					params += (params?'&':'')+key+'='+encodeURIComponent(dict_params[key]);
				}
				req.onreadystatechange = function () {
					if (req.readyState != 4) return; // not loaded
					// request completed

					if (req.status != 200) {
						console.error('Request failed, status='+req.status+', params='+params);
					}
					if (callback) callback(req);
					gbm.queue_next();
				}
				req.send(params);
			}, params);
}

gbm.bookmark_get_labels = function (url) {
	if (!tagtree.urls[url] || tagtree.urls[url].bm.length == 0) {
		// no labels
		return false;
	}
	var folder;
	var labels = '';
	var label;
	var gbookmark;
	for (var i=0; gbookmark=tagtree.urls[url].bm[i]; i++) {
		var folder = gbookmark.parentNode;
		if (!folder) {
			throw 'undefined folder, bm url='+url;
		}
		if (folder == browser.bookmarks) {
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


