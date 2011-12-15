

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
browser = gchr;

gchr.fullName = 'Google Chrome';
gchr.id = 'gchr';
gchr.name = 'chrome'

// import libraries, kind of inheritance
import_link(gchr, true);
import_queue(gchr);


gchr.onInit = function () {
	gchr.bookmarks = {bm: {}, f: {}, id: '1', title: 'Bookmarks Bar'};
	gchr.ids = {'1': gchr.bookmarks};
	gchr.actions = []; // TODO implement actions
}

gchr.startSync = function () {
	chrome.bookmarks.getSubTree(gchr.bookmarks.id,
			function (tree) {
				gchr.gotTree(tree[0], gchr.bookmarks);
				gchr.finished_start();
			}
	);
};

gchr.finished_start = function () {
	// merge() depends on browser.ids
	gchr.import_ids(gchr.bookmarks);

	// send 'finished' signal
	link_finished(gchr);
	gchr.addListeners(); // this should be 'disableable' (you should be able to disable it, without loosing sync functionality (except immediate upload)), but it isn't at the moment.
};

gchr.finished_sync = function () {
};

// import all local id's into gchr.ids
gchr.import_ids = function (folder) {
	gchr.ids[folder.id] = folder;
	var title;
	for (title in folder.f) {
		var subfolder = folder.f[title];
		gchr.import_ids(subfolder);
	}
	var url;
	for (url in folder.bm) {
		var bookmark = folder.bm[url];
		gchr.ids[bookmark.id] = bookmark;
	}
}

gchr.gotTree = function (gchr_parentNode, folder) {
	var node;
	for (var i=0; node=gchr_parentNode.children[i]; i++) {
		gchr.gotTree_handleNode(node, folder);
	}
};

// handle chrome bookmark tree nodes, helper function for gchr.gotTree
gchr.gotTree_handleNode = function (node, folder) {
	if (node.url) {
		// bookmark

		var bookmark = {title: node.title, url: node.url, parentNode: folder, mtime: node.dateAdded/1000, id: node.id};
		gchr.importBookmark(bookmark);
	} else {
		// folder

		// create the local node
		var subfolder = {title: node.title, parentNode: folder, bm: {}, f: {}, id: node.id};
		gchr.gotTree(node, subfolder); // recurse into subfolders

		gchr.importFolder(subfolder);

	}
};


gchr.remove_result = function () {
	console.log('Duplicate bookmark/folder removed.');
}

// import an array of BookmarkTreeNodes
gchr.import_bms = function (results) {
	var result;
	for (var i=0; result=results[i]; i++) {
		var folder = gchr.ids[result.parentId];
		if (result.url) {
			// bookmark
			var bm = {title: result.title, url: result.url, mtime: result.dateAdded, parentNode: folder, id: result.id};
			if (addBookmark(gchr, bm)) continue; // error
		} else {
			// folder
			var subfolder = {bm: {}, f: {}, title: result.title, parentNode: folder, id: result.id};
			addFolder(gchr, subfolder);
			chrome.bookmarks.getChildren(subfolder.id, gchr.import_bms);
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
};

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
};

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
	// this keeps evt_onRemoved from calling broadcastMessage('bm_del', ...)
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

gchr.bm_mod_title = gchr.f_mod_title = function (target, node, oldtitle) {
	gchr.queue_add(
			function (node) {
				chrome.bookmarks.update(node.id, {title: node.title},
					function (result) { gchr.queue_next(); });
			}, node);
}

gchr.bm_mod_url = function (target, node, oldurl) {
	gchr.queue_add(
			function (node) {
				chrome.bookmarks.update(node.id, {url: node.url},
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
		var bookmark = {title: node.title, url: node.url, parentNode: parentNode, mtime: node.dateAdded, id: id};
		gchr.ids[id] = bookmark;
		//parentNode.bm[bookmark.url] = bookmark;
		if (addBookmark(gchr, bookmark)) return; // error
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
	onChanged(gchr, node, changeInfo);
	commit();
}

gchr.evt_onMoved = function (id, moveInfo) {
	console.log('evt_onMoved');

	move_event(gchr, id, moveInfo.parentId, moveInfo.oldParentId);
}


gchr.import_node = function (id) {
	gchr.queue_add(
			function (id) {
				chrome.bookmarks.get(id,
						function (results) {
							gchr.import_bms(results);
							gchr.queue_next();
						});
			}, id);
};

