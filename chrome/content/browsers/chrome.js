

/* Message passing code below. */

// handle general requests
function onRequest (request, sender, sendResponse) {
	if (request.action == 'popupCreated') {
		popupCreated();
		sendResponse(undefined); // only because I have to
	} else if (request.action == 'popupClosed') {
		popupClosed();
		sendResponse(undefined); // because I have to
	}
}

chrome.extension.onRequest.addListener(onRequest);

/* Chrome link below. */

// prefix: gchr (Google CHRome)
var gchr = {};

gchr.name = 'Google Chrome';
gchr.shortname = 'gchr';

// include libraries
use_target(gchr);
use_queue(gchr);

// get saved data
gchr.lastSync = localStorage['gchr_lastSync'] || 0;

gchr.start = function () {
	gchr.ids = {'1': gchr.bookmarks}; // gchr.bookmarks will become g_bookmarks
	gchr.bookmarks = {bm: {}, f: {}, id: '1', title: 'Bookmarks Bar'};
	gchr.actions = []; // TODO implement actions

	chrome.bookmarks.getTree(
			function (tree) {
				gchr.gotTree(tree[0].children[0], gchr.bookmarks);
				gchr.finished_start();
			}
	);
};

gchr.finished_start = function () {
	// merge() depends on current_browser.ids
	// use gchr.bookmarks because they will become g_bookmarks anyway
	gchr.import_ids(gchr.bookmarks);

	// send 'finished' signal
	target_finished(gchr);
	gchr.addListeners(); // this should be 'disableable' (you should be able to disable it, without loosing sync functionality (except immediate upload)), but it isn't at the moment.
};

gchr.finished_sync = function () {
	// cleanup memory
	delete gchr.bookmarks;
};

// import all local id's into gchr.ids
gchr.import_ids = function (folder) {
	gchr.ids[folder.id] = folder;
	for (title in folder.f) {
		var subfolder = folder.f[title];
		gchr.import_ids(subfolder);
	}
	for (url in folder.bm) {
		var bookmark = folder.bm[url];
		gchr.ids[bookmark.id] = bookmark;
	}
}

gchr.gotTree = function (gchr_parentNode, folder) {
	var node;
	for (var i=0; node=gchr_parentNode.children[i]; i++) {
		if (node.url) {
			// bookmark
			var bookmark = {title: node.title, url: node.url, parentNode: folder, timestamp: node.dateAdded, id: node.id};
			if (folder.bm[bookmark.url]) { // UNTESTED
				// this bookmark does already exist
				// take the latest
				console.log('DUPLICATE: '+node.url);
				if (folder.bm[node.url].timestamp > bookmark.timestamp) {
					// this bookmark is older
					chrome.bookmarks.remove(node.id, gchr.remove_result);
					continue;
				} else {
					// the other bookmark is older
					chrome.bookmarks.remove(folder.bm[node.url].id, gchr.remove_result);
					folder.bm[node.url] = bookmark; // replace the other bookmark
					continue;
				}
			}
			folder.bm[bookmark.url] = bookmark;
		} else {
			// ignore folders without a title
			if (node.title === '') {
				continue;
			}

			// folder
			var subfolder = {title: node.title, parentNode: folder, bm: {}, f: {}, id: node.id};
			if (folder.f[subfolder.title]) {
				// duplicate folder, do nothing yet. FIXME: merge both folders
				console.log('DUPLICATE FOLDER: '+subfolder.title);
				continue;
			}
			folder.f[subfolder.title] = subfolder;
			gchr.gotTree(node, subfolder); // recurse into subfolders
		}
	}
};


gchr.remove_result = function (result) {
	console.log('Removed:');
	console.log(result);
}

// import an array of BookmarkTreeNodes
gchr.import_btns = function (results) {
	var result;
	for (var i=0; result=results[i]; i++) {
		var folder = gchr.ids[result.parentId];
		if (result.url) {
			// bookmark
			var bm = {title: result.title, url: result.url, timestamp: result.dateAdded, parentNode: folder, id: result.id};
			addBookmark(gchr, bm);
		} else {
			// folder
			var subfolder = {bm: {}, f: {}, title: result.title, parentNode: folder, id: result.id};
			addFolder(gchr, subfolder);
			chrome.bookmarks.getChildren(subfolder.id, gchr.import_btns);
		}
	}
	commit(); // not the most ideal place
};

gchr.addListeners = function () {
	// add event handlers
	chrome.bookmarks.onCreated.addListener(gchr.evt_onCreated);
	chrome.bookmarks.onRemoved.addListener(gchr.evt_onRemoved);
	chrome.bookmarks.onMoved.addListener  (gchr.evt_onMoved  );
	chrome.bookmarks.onChanged.addListener(gchr.evt_onChanged);
	return;
};

gchr.f_add  = function (source, folder) {
	gchr.queue_add(
			function (folder) {
				if (!folder.parentNode.id) {
					console.log('ERROR; No parentId for folder:');
					console.log(folder);
					gchr.queue_next();
					return;
				}
				gchr.creating_parentId = folder.parentNode.id;
				gchr.creating_title    = folder.title;
				chrome.bookmarks.create({parentId: folder.parentNode.id, title: folder.title}, 
						function (result) {
							folder.id = result.id;
							gchr.ids[folder.id] = folder;
							gchr.queue_next();
						});
			}, folder);
}

gchr.f_del = function (source, folder) {
	// remove own references
	delete gchr.ids[folder.id];
	// remove global references
	_rmFolder(folder);
	// keep in the queue to prevent possible errors
	gchr.queue_add(
			function (folder) {
				chrome.bookmarks.removeTree(folder.id);
				gchr.queue_next();
			}, folder);
}

gchr.bm_add = function (source, bm, lfolder) {
	if (!lfolder) lfolder = bm.parentNode;
	console.log('gchr.bm_add:');
	console.log(bm);
	gchr.queue_add(
			function (data) {
				gchr.creating_parentId = data.lfolder.id;
				gchr.creating_url      = data.bm.url;
				chrome.bookmarks.create({parentId: data.lfolder.id, title: data.bm.title, url: data.bm.url},
						function (result) {
							data.bm.id = result.id;
							gchr.ids[data.bm.id] = data.bm;
							gchr.queue_next();
						});
			}, {bm: bm, lfolder: lfolder});
};

gchr.bm_del = function (source, bm) {
	// remove this from our data
	// this keeps evt_onRemoved from calling call_all('bm_del', ...)
	delete gchr.ids[bm.id];
	// delete global reference
	_rmBookmark(bm); // _ before it so it won't call bm_del on all links
	// just to keep it safe, in the queue
	gchr.queue_add(
			function (bm) {
				chrome.bookmarks.remove(bm.id,
						function (result) {
							// this MUST be in a separate function
							// (queue_next MUST be called on gchr, otherwise it doesn't have
							//  a 'this' object)
							gchr.queue_next();
						});
			}, bm);
};

gchr.bm_mv = gchr.f_mv = function (target, node, oldParent) {
	gchr.queue_add(
			function (node) {
				chrome.bookmarks.move(node.id, {parentId: node.parentNode.id},
					function (result) { gchr.queue_next(); });
			}, node);
}

gchr.commit = function () {
	gchr.queue_start();
}

/*************************************
 * Listen to bookmark events
 ************************************/

gchr.evt_onCreated = function (id, node) {
	console.log('evt_onCreated');
	if (node.parentId == gchr.creating_parentId &&
			(node.url == gchr.creating_url || node.title == gchr.creating_title)) {
		delete gchr.creating_parentId;
		delete gchr.creating_url;
		delete gchr.creating_title;
		return;
	}
	if (node.id in gchr.ids) return; // already tracked
	if (!gchr.ids[node.parentId]) return; // not in the synced folder
	var parentNode = gchr.ids[node.parentId];
	if (node.url) {
		// bookmark
		console.log('Created new bookmark: '+node.url);
		var bookmark = {title: node.title, url: node.url, parentNode: parentNode, timestamp: node.dateAdded, id: id};
		gchr.ids[id] = bookmark;
		//parentNode.bm[bookmark.url] = bookmark;
		//call_all('bm_add', gchr, [bookmark]);
		addBookmark(gchr, bookmark);
	} else {
		// folder
		console.log('Created new empty folder: '+node.title);
		var folder = {title: node.title, parentNode: parentNode, bm: {}, f: {}, id: id};
		gchr.ids[id] = folder;
		addFolder(gchr, folder);
	}
	commit();
};

gchr.evt_onRemoved = function (id, removeInfo) {
	try {
		console.log('evt_onRemoved');
		if (!(id in gchr.ids)) {console.log('not here');return;} // already removed (or in the 'Other Bookmarks' menu)... FIXME this may change in a future version (like chrome.bookmarks.onCreated)
		var node = gchr.ids[id];
		if (node.url) {
			// bookmark
			var bookmark = node;
			rmBookmark(gchr, bookmark);
		} else {
			// folder
			console.log('Removed folder: '+node.title);
			rmFolder(gchr, node);
		}
		commit();
	} catch (error) {
		console.log('ERROR ERROR ERROR in evt_onRemoved:');
		console.log(error);
	}
	console.log('end of evt_onRemoved');
}

gchr.evt_onChanged = function (id, changeInfo) {
	console.log('evt_onChanged');
	var node = gchr.ids[id];
	if (!node) return; // somewhere outside the synced folder (or bug)
	if (changeInfo.url) {
		// bookmark
		
		// has anything changed?
		if (changeInfo.url == node.url && changeInfo.title == node.title) return; // changed by me?
		if (changeInfo.url != node.url) {
			console.log('Url of '+node.title+' changed from '+node.url+' to '+changeInfo.url);

			var oldurl = node.url;

			// delete old reference
			delete node.parentNode.bm[node.url];
			// change url
			node.url = changeInfo.url;

			// does that url already exist?
			if (node.parentNode.bm[node.url]) {
				console.log('"Duplicate URL '+node.url+', merging by removing other...');
				rmBookmark(node.parentNode.bm[node.url]);
			}

			// add new reference
			node.parentNode.bm[node.url] = node;

			call_all('bm_mod_url', gchr, [node, oldurl]);
		}

		if (changeInfo.title != node.title) {
			console.log('Title of url '+node.url+' changed from '+node.title+' to '+changeInfo.title);
			var oldtitle = node.title;
			node.title = changeInfo.title;
			call_all('bm_mod_title', gchr, [node, oldtitle]);
		}

	} else {
		// folder
		// only title changes are possible
		if (node.title == changeInfo.title) return; // nothing changed (or changed by me?)
		
		var oldtitle = node.title;
		var newtitle = changeInfo.title;
		node.title = newtitle;

		var parentNode = node.parentNode;
		delete parentNode.f[oldtitle];
		parentNode.f[newtitle] = node;
		call_all('f_mod_title', gchr, [node, oldtitle]);
	}
	commit();
}

gchr.evt_onMoved = function (id, moveInfo) {
	console.log('evt_onMoved');
	// get info
	var node      = gchr.ids[id];
	var newParent = gchr.ids[moveInfo.parentId];
	var oldParent = gchr.ids[moveInfo.oldParentId];

	// if the bookmark has been moved by Sync2all, ignore this event
	if (node && newParent && node.parentNode == newParent) {
		return;
	}

	// if node is moved to outside synced folder
	if (!newParent) {
		// if the node comes from outside the synced folder
		if (!oldParent) {
			if (!node) {
				console.log('Bookmark/folder outside synchronized folder moved. Ignoring.');
				return;
			} else {
				console.log('BUG: only the node is known, not the rest \
						(including the parent!)');
				return;
			}
		} else { // the 'else' is not really needed
			if (!node) {
				console.log('BUG: only the old parent is known, not the node \
						nor the new parent');
				return;
			} else {
				// newParent is not known, node and oldParent are known.
				console.log('Move: new parent not found. Thus this bookmark/folder is \
						moved to outside the synced folder.');

				// remove the node
				delete gchr.ids[node.id];
				rmNode(gchr, node); // parent needed for bookmarks
				commit()
				return;
			}
		}
	} else {
		if (!node) {
			if (!oldParent) {
				// this bookmarks comes from the 'Other Bookmarks' menu (at least, its origin is unknown)
				console.log('Move: node id and oldParent not found. I assume this\
					bookmark comes from outside the synchronized tree. So doing a crete now');
				gchr.queue_add(
						function (id) {
							chrome.bookmarks.get(id,
									function (results) {
										gchr.import_btns(results);
										gchr.queue_next();
									});
						}, id);
				commit();
				return;
			} else {
				console.log('BUG: the node is not known, but the old parent \
						and the new parent are.');
				return;
			}
		} else {
			if (!oldParent) {
				console.log('BUG: only the old parent is not known. The node \
						and the new parent are.');
				return;
			} else {
				// the bookmark has been moved within the synced folder tree.
				// Nothing strange has happened.
			}
		}
	}

	// newParent, node and oldParent are 'defined' variables. (i.e. not
	// 'undefined').

	if (newParent == oldParent) {
		// node moved inside folder (so nothing has happened, don't know
		// whether this is really needed, Chrome might catch this).
		return;
	}

	
	// Bookmark is moved inside synced folder.

	node.parentNode = newParent;

	if (node.url) {
		// bookmark
		console.log('Moved '+node.url+' from '+(oldParent?oldParent.title:'somewhere in the Other Bookmarks menu')+' to '+newParent.title);
		newParent.bm[node.url] = node;
		delete oldParent.bm[node.url];
		call_all('bm_mv', gchr, [node, oldParent]);
	} else {
		// folder
		if (newParent.f[node.title]) {
			console.log('FIXME: duplicate folder overwritten (WILL FAIL AT SOME POINT!!!)');
		}
		newParent.f[node.title] = node;
		delete oldParent.f[node.title];
		call_all('f_mv', gchr, [node, oldParent]);
	}
	commit();
}
