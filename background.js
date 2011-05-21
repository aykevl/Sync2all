
var current_browser = gchr; // currently only supports Google Chrome
var remotes = [gbm, opl];
var remotes_enabled = [];
var remotes_by_name = {gbm: gbm, opl: opl};
var local   = gchr; // TODO make more flexible in the future (for Firefox support)
var remotes_finished;

var g_bookmarks; // global bookmarks

statuses = {
	READY:       0,
	AUTHORIZING: 1,
	DOWNLOADING: 2,
	MERGING:     3,
	UPLOADING:   4,
}


// global variables that are only for the (first) sync
var l_queue   = []; // local queue (list of [callback, data])


// debugging flag, don't change Google Bookmarks (but may change local bookmarks)
var DO_NOTHING = false;

/* = Nodes =

   == Bookmark ==
   dictionary: {
	title:      // title of the bookmark
	id:         // local id
	timestamp:  // integer, timestamp
	parentNode: // it's parent folder
	url:        // 
   }

   == Folder ==
   dictionary: {
	title: ..., // title of folder
	id          // Local (Chrome) node id
	bm: {...}   // dictionary of bookmark nodes (key = url)
	f: {...}    // dictionary of folder   nodes (key = title)
	parentNode  // It's parent. Doesn't exist for the root.
   }
*/

var lastSync      = 0; //localStorage['lastSync'];

/*var synced = false;      // when in sync, this is true
var syncing = false;     // if doing some work locally (or when syncing full)
var downloading = false; // if downloading bookmarks*/

// update the popup UI
function update_ui() {
	chrome.extension.sendRequest({action: 'updateUi'}, function () {});
}


function onLoad() {
	initSync();
}

function call_all(funcname, target, params) { // function will not be called on target, this indicates the target where it is already noted
	var remote;
	if (params) params.unshift(target);
	for (var i=0; remote=remotes_finished[i]; i++) {
		if (remote == target) continue; // if this is the target where the call comes from

		func = remote[funcname];
		if (func == false) continue; // marked as not available;
		if (func == undefined) {
			console.log('WARNING: '+remote.name+' hasn\'t implemented '+funcname+' (set to false to ignore)');
			continue;
		}

		if (params) {
			func.apply(this, params);
		} else {
			func.apply(this);
		}
	}
}

function commit() {
	call_all('commit');
}

function target_finished(remote) {

	// is this the browser itself? start the rest!
	remotes_finished.push(remote);
	merge(remote);
	if (remote == current_browser) {
		var remote;
		for (var i=0; remote=remotes[i]; i++) {
			remote.init();
		}
	} else {
		// this is a real target link
	}
	
	// is the syncing finished? Commit changes!
	if (remotes_enabled.length+1 == remotes_finished.length) { // current_browser isn't in remotes_enabled, but is in remotes_finished. The +1 is to correct this.
		commit();
		call_all('finished_sync');
	}
}

function addNode(source, node, parentNode) {
	node.parentNode = parentNode;
	if (node.url) {
		addBookmark(source, node);
	} else {
		addFolder(source, node);
	}
}
function addBookmark(source, bm) {
	bm.parentNode.bm[bm.url] = bm;
	call_all('bm_add', source, [bm]);
}
function addFolder(source, folder) {
	folder.parentNode.f[folder.title] = folder;
	call_all('f_add', source, [folder]);
}

function rmNode(source, node) {
	if (node.url) {
		rmBookmark(source, node);
	} else {
		rmFolder(source, node);
	}
}

function rmBookmark(source, bookmark) { // public function
	_rmBookmark(bookmark);
	console.log('Removed bookmark: '+bookmark.url);
	call_all('bm_del', gchr, [bookmark]);
}
function _rmBookmark(bookmark) { // internal use only
	delete bookmark.parentNode.bm[bookmark.url];
}

function rmFolder(source, folder) {
	_rmFolder(folder);
	call_all('f_del', source, [folder]);
}
function _rmFolder(folder) {
	delete folder.parentNode.f[folder.title];
}



// dump all important variables
// Only useful for debugging.
function dump_all() {
	console.log('--------------------------------------------------');
	console.log('root:');
	console.log(root);
	console.log('--------------------------------------------------');
}

// Start synchronisation. This starts all other things, like Google Bookmarks or Opera Link
function initSync () {
	update_ui();

	remotes_finished = [];

	startSync = 0; // will be updated when targets are synchronized
	current_browser.start();
}


function merge (obj) {
	// apply actions
	var action;
	for (var i=0; action=obj.actions[i]; i++) {

		// like call_all
		var command = current_browser[action[0]];
		var args    = [obj];
		var arg;
		// start after the first arg
		for (var i_arg=1; arg=action[i_arg]; i_arg++) {
			args.push(current_browser.ids[arg]);
		}
		command.apply(this, args);
	}
	
	if (!g_bookmarks) {
		console.log('Taking '+obj.name+' as base of the bookmarks.');
		g_bookmarks = obj.bookmarks;
	} else {
		console.log('Merging bookmarks with '+obj.name+'...');
		mergeBookmarks(g_bookmarks, obj.bookmarks, obj);
		console.log('Finished merging.');
	}
};

function mergeProperties(from, to) {
	for (key in from) {
		if (key == 'bm' || key == 'f' || key == 'parentNode') continue;
		if (to[key] === undefined) {
			to[key] = from[key];
		}
	}
};

// 'local' represents 'remote'.
// 'target' is the source of 'remote' ($remote might represent $target.bookmarks)
function mergeBookmarks(local, remote, target) {

	// merge properties
	mergeProperties(remote, local);

	// unique local folders
	for (title in local.f) {
		var local_subfolder = local.f[title];

		// sub-label
		if (!(title in remote.f)) {
			// unique folder/label
			console.log('Unique local folder: '+title);
			syncLFolder(target, local_subfolder);

		} else {
			// other folder does exist, merge it too

			var remote_subfolder = remote.f[title];

			mergeBookmarks(local_subfolder, remote_subfolder, target);
		}
	}

	// find unique remote bookmarks
	for (url in remote.bm) {
		var bookmark = remote.bm[url];
		if (!(url in local.bm)) {
			// unique remote bookmark
			console.log('Unique remote bookmark: '+bookmark.url);
			syncRBookmark(target, bookmark, local);
		} else {
			mergeProperties(bookmark, local.bm[url]);
		}
	}

	// resolve unique local bookmarks
	for (url in local.bm) {
		var bm = local.bm[url];
		if (!(url in remote.bm)) {
			// unique local bookmark
			console.log('Unique local bookmark: '+bm.url);
			syncLBookmark(target, bm);
		} else {
			// TODO merge changes (changed title etc.)
			// bookmark exists on both sides
			/*// bookmark exists at remote
			var bookmark = parentNode.bm[url];
			local_ids[bm.id] = bookmark;
			// FIXME check for duplicate (local) URLs (in the same folder)
			bookmark.id = bm.id;
			if (bm.title != bookmark.title) {
				// title changed, set local title to remote title
				console.log('Title of bookmark changed: '+bm.url);

				// changing this doesn't hurt (will be tracked, will not recurse)
				chrome.bookmarks.update(bookmark.id, {title: bookmark.title});
			}*/
		}
	}

	// find unique remote folders (for example, Google Bookmarks)
	for (title in remote.f) {
		var rsubfolder = remote.f[title];
		if (!(title in local.f)) {
			// unique remote folder
			console.log('Unique remote folder:');
			console.log(rsubfolder);
			syncRFolder(target, rsubfolder, local);
		}
	}
}

// folder is (not yet) in the local bookmarks
// lparentfolder represents rfolder.parentNode
function syncRFolder(target, rfolder, lparentfolder) {
	var bookmark_count = 0;

	// TODO create (tmp?) folder
	var lfolder = {bm: {}, f: {}, title: rfolder.title, parentNode: lparentfolder};
	lparentfolder.f[lfolder.title] = lfolder;
	call_all('f_add', target, [lfolder]);

	// sync bookmarks
	for (url in rfolder.bm) {
		var rbookmark = rfolder.bm[url];
		bookmark_count += syncRBookmark(target, rbookmark, lfolder);
	}

	// sync folders/labels
	for (title in rfolder.f) {
		var subrfolder = rfolder.f[title];
		console.log(subrfolder);
		bookmark_count += syncRFolder(target, subrfolder, lfolder); // recursion
	}

	// if there aren't any bookmarks in this folder (and thus also no folders)
	if (bookmark_count == 0) {
		target.f_del(undefined, rfolder);
		delete rfolder.parentNode.f[rfolder.title];
		delete lfolder.parentNode.f[lfolder.title];
		console.log('Removed empty folder: '+rfolder.title);
	}

	// for recursion
	return bookmark_count;
}

// folder exists only locally
function syncLFolder(target, folder) {
	var bookmark_count = 0;

	if (target.f_add !== false) target.f_add(undefined, folder);

	// sync folders
	var subfolder;
	for (title in folder.f) {
		subfolder = folder.f[title];
		bookmark_count += syncLFolder(target, subfolder);
	}

	// sync bookmarks
	var bm;
	for (url in folder.bm) {
		bm = folder.bm[url];
		bookmark_count += syncLBookmark(target, bm);
	}

	// remove folder if empty
	if (bookmark_count == 0) {
		// TODO, check whether this works
		//delLFolder(target, folder);
	}
	return bookmark_count;
}

// bookmark exists only on remote (for example, on Google Bookmarks)
function syncRBookmark(target, bookmark, lfolder) {
	// sync single bookmark
	// if the bookmark is new and this isn't the first sync
	if (bookmark.time < target.lastSync && lastSync != 0) {
		// this bookmark is really old
		return delRBookmark(target, bookmark, lfolder);
	} else {
		return pushRBookmark(target, bookmark, lfolder);
	}
}
function delRBookmark(target, bookmark, lfolder) {
	console.log('Old remote bookmark :'+bookmark.url);
	call_all('bm_del', target, [bookmark]);
	// bookmark doesn't exist locally, so no removing required
	return 0;
}
function pushRBookmark(target, bookmark, lfolder) {
	console.log('New remote bookmark: '+bookmark.url);
	call_all('bm_add', target, [bookmark, lfolder]);
	return 1;
}

// bookmark exists only locally
function syncLBookmark(target, bookmark) {
	if (lastSync == 0 || bookmark.timestamp > lastSync) { // initial sync or really new bookmark
		return pushLBookmark(target, bookmark);
	} else {
		return delLBookmark(target, bookmark);
	}
}
function pushLBookmark(target, bm) {
	console.log('New local bookmark: '+bm.url);
	target.bm_add(undefined, bm);
	return 1;
}
function delLBookmark(target, bm) {
	// remove bookmark
	console.log('Old local bookmark: '+bm.url);
	// TODO
	//call_all('bm_del', target, [bm]);
	return 0;
}


