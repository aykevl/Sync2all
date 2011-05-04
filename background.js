
var current_browser = gchr; // currently only supports Google Chrome
var remotes = [gbm, opl];
var local   = gchr; // TODO make more flexible in the future (for Firefox support)
var remotes_finished;

var g_bookmarks; // global bookmarks
//var labels;    // dict, key=label, value=node
//var local_ids; // map: dictionary (local folder/bookmark id => folder node)

//var opt_pathSep;
//var opt_rootNodeLabel;


// global variables that are only for the (first) sync
var l_changed = {}; // nodes locally changed, to be appended to the upload queue
var r_changed = {}; // same, but for remote
var l_queue   = []; // local queue (list of [callback, data])


// debugging flag, don't change Google Bookmarks (but may change local bookmarks)
var DO_NOTHING = false;

/* = Nodes =

   == Bookmark ==
   dictionary: {
	title:      // title of the bookmark
	id:         // local id
	time:       // integer, timestamp
	parentNode: // it's parent folder
	url:        // some weird characters?
   }

   == Folder ==
   dictionary: {
	title: ..., // title of folder
	id          // Local (Chrome) node id
	bm: {...}   // dictionary of bookmark nodes (key = url)
	f: {...}    // dictionary of folder   nodes (key = title)
   }
*/

var lastSync      = 0; //localStorage['lastSync'];
//var syncStartTime;

var synced = false;      // when in sync, this is true
var syncing = false;     // if doing some work locally (or when syncing full)
var downloading = false; // if downloading bookmarks

var popup_ui_update;
function update_ui() {
	// events should attach to this function
	// maybe tere's a better way to handle this?
	if (popup_ui_update) {
		popup_ui_update();
	}
}


function onLoad() {
	if (localStorage["synced"] != "true") {
		return;
	}

	startSync();
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
	remotes_finished.push(remote);
	lastSync = Math.max(lastSync, remote.lastSync);
	merge(remote);
	if (remotes.length == remotes_finished.length) {
		current_browser.start();
	}
	if (remote == current_browser) {
		commit();
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
	/*for (url in folder.bm) {
		_rmBookmark(folder.bm[url]);
	}
	for (title in folder.f) {
		_rmFolder(folder.f[title]);
	}*/
}

// TODO implement in a better way
/*function addLBookmark(bm, options) {
	syncLBookmark(bm, local_ids[bm.parentId], options); // noremove prevents this bookmark from removing after creation (which is not desired)
}

function addLFolder(f, options) {
	var parentNode = local_ids[f.parentId];
	var folder = {bm: {}, f: {}, title: f.title, id: f.id, parentNode: parentNode};
	parentNode.f[f.title] = folder;
	local_ids[f.id] = folder;

	// this doesn't modify anything so is it is save to do this outside the queue (and maybe better)
	chrome.bookmarks.get(folder.id,
			function (results) {
				syncLFolder(results[0], folder, options);
			});
}*/

// mark bookmark that they should be uploaded
/*function touchLFolder(folder, options) {
	var bookmark;
	for (url in folder.bm) {
		bookmark = folder.bm[url];
		console.log('marked '+bookmark.url);
		add_l_changed(bookmark);
	}
	var subfolder;
	for (title in folder.f) {
		subfolder = folder.f[title];
		touchLFolder(subfolder, options);
	}
}*/


function dump_all() {
	console.log('--------------------------------------------------');
	console.log('root:');
	console.log(root);
	console.log('--------------------------------------------------');
}

/*function decCount() {
	count--;
	if (count == 0) {
		if (stage == stages.SYNCING) {
			console.log('Start uploading...');
			update_ui(stages.UPLOADING);
			commitChanges();
		} else if (stage == stages.UPLOADING) {
			console.log('Finished comitting.');
			localStorage['lastSync'] = syncStartTime;
			update_ui(stages.IDLE);
		} else if (stage == stages.STOPPING) {
			console.log('Finished stopping.');
			update_ui(stages.STOPPED);
		}
	} else if (count < 0) {
		alert('FAIL! count = '+count);
		count++;
	}
}*/

function set_default_opts() {
	var defaults = { // TODO move this to each remote
		'gbm_pathsep': '/',
		'gbm_rootNodeLabel': 'Root',
	};
	for (key in defaults) {
		if (localStorage[key] == undefined) {
			localStorage[key] = defaults[key];
		}
	}
}

function startSync () {
	console.log('Start fetching bookmarks...');
	syncing     = true;
	downloading = true;
	localStorage.synced = true;
	update_ui();

	// load options
	set_default_opts(); // only sets the default when needed
	//opt_pathSep       = localStorage['opt_pathsep'];
	//opt_rootNodeLabel = localStorage['opt_rootNodeLabel'];

	remotes_finished = [];

	syncStartTime = new Date().getTime();
	startSync = 0; // will be updated when targets are synchronized
	var remote;
	for (var i=0; remote=remotes[i]; i++) {
		remote.start();
	}
}


/*function bookmarkAdded(url, bm, parentNode) {
	if (url in bookmarks) {
		// this bookmark needs to be updated
		var bookmark = bookmarks[url];
		if (parentNode.label) {
			// not at the root
			bookmark.labels[parentNode.label] = parentNode;
		} else {
			// at the root
			bookmark.labels[opt_rootNodeLabel] = folders;
		}
		parentNode.bm[url] = bookmark;
		bookmark.title = bm.title; // the title may have changed
	} else {
		// new bookmark
		var bookmark = {'title': bm.title, 'url': bm.url, 'l_ids': {}, labels: {}};
		bookmark.labels[parentNode.label] = parentNode;
		bookmark.l_ids[bm.id] = parentNode;
		bookmarks[url] = bookmark;
		parentNode.bm[url] = bookmark;
	}
	changed_bookmark(url);
}*/

/*function bookmarkRemoved(node, parentNode) {
	console.log('Bookmark removed: '+node.url+' label: '+parentNode.label);
	delete parentNode.bm[node.url];
	delete node.labels[parentNode.label];
	changed_bookmark(node.url).needs_upload = true;
}*/

/*function labelRemoved(node) {
	for (url in node.bm) {
		bookmarkRemoved(node.bm[url], node);
	}
	for (title in node.f) {
		labelRemoved(node.f[title]);
	}
	delete labels[node.label];
	delete node.parentNode.f[node.title];
}

function labelRenamed(node, newParent, label) {
	// TODO
	var oldLabel = node.label;
	var newLabel = (newParent.title?newParent.label+opt_pathSep:'')+node.title;
	delete labels[oldLabel];
	labels[newLabel] = node;
	node.label = newLabel;
	for (url in node.bm) {
		var bookmark = node.bm[url];
		for (label in bookmark.labels) {
			// only the first occurence will be replaced
			var newSubLabel = label.replace(oldLabel, newLabel);
			delete bookmark.labels[label];
			bookmark.labels[newSubLabel] = labels[newSubLabel];
		}
		changed_bookmark(url).needs_upload = true;
	}
	for (title in node.f) {
		var folder = node.f[title];
		// only the first occurence will be replaced
		// label of this node will be changed here:
		labelRenamed(folder, node);
	}
}*/

function merge (obj) {
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
		if (to[key]) continue;
		to[key] = from[key];
	}
};

// 'local' represents 'remote'.
// 'target' is the source of 'remote' ($remote might represent $target.bookmarks)
function mergeBookmarks(local, remote, target) {

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

			// merge properties
			mergeProperties(remote, local);

			mergeBookmarks(local_subfolder, remote_subfolder, target);
		}
	}

	// find unique remote bookmarks
	for (url in remote.bm) {
		var bookmark = remote.bm[url];
		if (!(url in local.bm)) {
			// unique remote bookmark
			console.log('Unique remote bookmark: '+bookmark.url);
			console.log(bookmark.parentNode.opl_id);
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

	target.f_add(undefined, folder);

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



/* Added or changed local bookmark, push it to Google
 */
/*function add_l_changed(node) {
	if (!l_changed[node.url]) {
		l_changed[node.url] = node;
	}
}*/

/* Added or changed google bookmark, add or change it here
 */
/*function add_r_changed(node) {
	if (!r_changed[node.bm.url]) {
		r_changed[node.bm.url] = node;
	}
}*/

function commitChanged() {
	// add l_changed and r_changed to the queue
	for (url in l_changed) {
		var bookmark = l_changed[url];
		if (bookmark.labels.length == 0) {
			// remove bookmark
			call_all('bm_remove', [bookmark]);
		} else {
			// add/change bookmark
			call_all('bm_update', [bookmark]);
		}
	}
	l_changed = {};
	var has_r_changes = false;
	for (url in r_changed) {
		has_r_changes = true;
		var data = r_changed[url];
		ensureLFolderExists(data.f);
		l_queue_add(
				function (callback, data) {
					creating_parentId = data.f.id;
					creating_url      = data.bm.url;
					chrome.bookmarks.create({'title': data.bm.title, 'url': data.bm.url,
							'parentId': data.f.id}, function (node) {
							if (!node) {
								// happens sometimes with invalid urls. FIXME will be removed with the next sync (?)
								console.log('Failed to create bookmark. bookmark:');
								console.log(data);
							} else {
								data.bm.id = node.id;
								local_ids[node.id] = data.bm;
							}
							callback();
							});
				},
				data
		);
	}
	r_changed = {};
	if (has_r_changes == false) {
		syncing = false;
		synced  = true;
		localStorage['lastSync'] = syncStartTime;
		update_ui();
	}
}

function ensureLFolderExists(folder) {
	if (folder.id) return;
	if (folder == root) return;
	if (!folder.parentNode.id) {
		ensureLFolderExists(folder.parentNode);
	}
	l_queue_add(
			function (callback, folder) {
				if (folder.id) {
					callback();
					return; // ugly?
				}
				// to be able to identify that this creation comes from me
				creating_parentId = folder.parentNode.id;
				creating_title    = folder.title;
				chrome.bookmarks.create({'title': folder.title, 'parentId': folder.parentNode.id}, 
					function (result) {
						folder.id = result.id;
						local_ids[result.id] = folder;
						callback();
						});
			}, folder);
}

/*function withSignature(callback) {
	if (signature) {
		callback();
	} else {
		var sigget = new XMLHttpRequest();
		sigget.open("GET", 'https://www.google.com/bookmarks/mark?op=edit&output=popup', true);
		sigget.onreadystatechange = function () {
			if (sigget.readyState == 4) {
				if (sigget.status != 200) {
					console.log("Failed to get signature key:");
					console.log(sigget);
					decCount();
					return;
				}
				var response = sigget.response;
				var start = response.indexOf('name=sig value="')+16;
				var stop = response.indexOf('">', start);
				signature = response.slice(start, stop);
				console.log('got signature');
				callback();
				decCount();
			}
		}
		count++;
		sigget.send(null);
	}
}*/

/*function commitChanges() {
	// FIXME change this a bit so the signature is only loaded when needed
	withSignature(doCommitChanges);
}

// needs signature
function doCommitChanges() {

	// added labels, create the local folders.
	for (label in changed_fs) {
		var folder = changed_fs[label];
		count++;
		chrome.bookmarks.create({'parentId': folder.parentNode.l_id, 'title': folder.title}, pullBookmarks);
		delete changed_fs[label]; // now committed (and would otherwise keep looping???)
	}

	for (url in changed_bms) {
		var changed_bm = changed_bms[url];
		var bookmark = changed_bm.node;
		// I hope Chrome will serialize these requests, it may be a lot at once...
		if (changed_bm.needs_upload) {
			// get the keys (labels)
			var bm_labels = [];
			for (var label in bookmark.labels) {
				bm_labels.push(label);
			}
			if (bm_labels.length == 0) {
				doRemoveSingleUrl(bookmark, url);
			} else {
				if (bm_labels.length == 1 && bm_labels[0] == opt_rootNodeLabel) {
					bm_labels = [];
				}
				doUploadSingleUrl(bookmark, bm_labels, url);
			}
		}
		if (changed_bm.new_folders) {
			for (parentId in changed_bm.new_folders) {
				chrome.bookmarks.create({'parentId': parentId, 'title': bookmark.title, 'url': bookmark.url});
			}
		}
		delete changed_bms[url]; // is now committed (and will otherwise loop tens of times???)
	}
}*/
/*function doUploadSingleUrl(bookmark, bm_labels, url) {
	// in new function because of the scope variables
	var http = new XMLHttpRequest();
	http.open("POST", 'https://www.google.com/bookmarks/mark', true);
	var fixed_url = url;
	if (DO_NOTHING) {
		console.log('NOT PUSHED URL: '+url);
		console.log(bookmark);
		return;
	}
	// TODO javascript URLs (bookmarklets)
	/ *if (url.slice(0,9) == 'javascript:') {
		// a hack to allow bookmarklets.
		// Copied from GMarks, from the file components/nsIGmarksCom_google.js
		bm.notes = bm.url;
		bm.url = this.BKMKLET_URL+"&str=";
		/* add a random string to make a unique url * /
		var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz".split("");
		var string_length=40;
		for (var i=0; i<string_length; i++) {
			var idx = Math.floor(Math.random() * chars.length);
			bm.url += chars[idx];//chars.substring(rnum,rnum+1);
		}
	}* /

	var bm_labels_escaped = [];
	var bm_label;
	for (var i=0; bm_label=bm_labels[i]; i++) {
		bm_labels_escaped.push(encodeURIComponent(bm_label));
	}

	var params = 'bkmk='+escape(fixed_url)+'&prev=&title='+encodeURIComponent(bookmark.title)+'&labels='+bm_labels_escaped.join(',')+'&sig='+signature;
	http.onreadystatechange = function (evt) {
		if (http.readyState == 4) {
			if (http.status != 200) {
				console.log(http);
			} else {
				console.log('sent bookmark: '+url);
				console.log(http);
				bookmark.id = http.responseText; // the new ID
			}
			decCount();
		}
	}
	count++;
	http.send(params);
}

function doRemoveSingleUrl(bookmark, url) {
	if (DO_NOTHING) {
		console.log('NOT REMOVED URL: '+url);
		return;
	}
	var id = bookmark.id
	var http = new XMLHttpRequest();
	http.open('POST', 'https://www.google.com/bookmarks/mark', true);
	var params = 'dlq='+id+'&s='+signature;
	http.onreadystatechange = function (evt) {
		if (http.readyState == 4) {
			if (!(http.status == 200)) {
				console.log(http);
			} else {
				console.log('Removed Google bookmark: '+url);
				console.log(http);
				// clear all traces
				delete bookmarks[url];
				for (var label in bookmark.labels) {
					delete bookmark.labels[label].bm[url];
				}
			}
			decCount();
		}
	}
	count++;
	http.send(params);
}*/

/*function pullBookmarks(newFolder) {
	// TODO check for empty folders
	var parentNode = local_ids[newFolder.parentId];
	var childNode  = parentNode.f[newFolder.title];
	childNode.l_id = newFolder.id;
	console.log('Importing folder:');
	console.log(childNode);
	local_ids[newFolder.id] = childNode;
	for (url in childNode.bm) {
		var bookmark = childNode.bm[url];
		if (bookmark.time > lastSync) {
			chrome.bookmarks.create({'title': bookmark.title, 'url': url, 'parentId': childNode.l_id});
		} else {
			console.log('Old bookmark, in folder: '+url);
			changed_bookmark(bookmark.url).needs_upload = true;
			delete bookmark.labels[childNode.label];
			delete childNode.bm[bookmark.url];
		}
	}
	for (title in childNode.f) {
		var folder = childNode.f[title];
		count++;
		chrome.bookmarks.create({'title': folder.title, 'parentId': childNode.l_id}, pullBookmarks);
	}
	decCount();
}*/

/*function pushBookmarks(c_folder, parentNode) {
	console.log('pushBookmarks');
	if (parentNode.f[c_folder.title]) {
		console.log('Blaat!!!!!!!!!!!!!!!');
	}
	parentNode.f[c_folder.title] = {
		parentNode: parentNode,
		title: c_folder.title,
		l_id: c_folder.id,
		label: ((parentNode.label==opt_rootNodeLabel || parentNode.label=='')?'':parentNode.label+opt_pathSep)+c_folder.title,
		f: {},
		bm: {},
	};
	childNode = parentNode.f[c_folder.title];
	labels[childNode.label] = childNode;
	local_ids[c_folder.id] = childNode;
	var c_node;
	if (c_folder.children === undefined) {
		// chrome.bookmarks.onCreated event handler, doesn't have c_folder.children
		// but doesn't have the children too (I hope, otherwise it will fail at some point)
		return;
	}
	for (var i=0; c_node=c_folder.children[i]; i++) {
		if (c_node.url == undefined) {
			// folder
			pushBookmarks(c_node, childNode);
		} else {
			// bookmark
			if (bookmarks[c_node.url]) {
				// modified bookmark
				var bookmark = bookmarks[c_node.url];
				bookmark.labels[childNode.label] = childNode;
				bookmark.l_ids[c_node.id] = childNode;
				childNode.bm[c_node.url] = bookmark;
			} else {
				// new bookmark
				var bookmark = childNode.bm[c_node.url] = {
					url: c_node.url,
					title: c_node.title,
					l_ids: {
					},
					parentNode: childNode,
					labels: {
					},
				}
				bookmark.labels[childNode.label] = childNode;
				childNode.bm[c_node.id] = childNode;
				bookmarks[c_node.url] = bookmark;
			}
			changed_bookmark(c_node.url).needs_upload = true;
		}
	}
}*/

/*var req;
var req_stopped;
var g_bookmarks;
var l_bookmarks;
var l_bookmarks_map;
var signature;
var g_bookmarks_changed; // dictionary of g_node objects, with url as key
var g_bookmarks_removed; // dictionary: g_bookmark id => g_node
var c_bm_map_g;
var g_map_urls;
var lastSync;
var syncStartTime;

var count = 0;
var stage = 0;
var stages = {
	IDLE:      0,
	FETCHING:  1,
	SYNCING:   2,
	UPLOADING: 3,
	STOPPING:  4,
	STOPPED:   5,
};

var popup_ui_update;

// Copied from GMarks, from the top of the file components/nsIGmarksCom_google.js
var BKMKLET_URL = "https://www.google.com/bookmarks/find?q=javascript&src=gmarksbkmklet";

function update_ui(new_stage) {
	// maybe terere's a better way to handle this
	if (stage == new_stage) {
		return;
	}
	stage = new_stage;
	if (popup_ui_update) {
		popup_ui_update();
	}
}

function decCount() {
	count--;
	if (count == 0) {
		if (stage == stages.FETCHING) {
			update_ui(stages.SYNCING);
			count++;
			console.log('Start synchronizing...');
			syncBookmarks(l_bookmarks, g_bookmarks);
		} else if (stage == stages.SYNCING) {
			console.log('Start uploading...');
			count++;
			update_ui(stages.UPLOADING);
			uploadChanges();
		} else if (stage == stages.UPLOADING) {
			console.log('Finished syncing.');
			localStorage['lastSync'] = syncStartTime;
			update_ui(stages.IDLE);
		} else if (stage == stages.STOPPING) {
			console.log('Finished stopping.');
			update_ui(stages.STOPPED);
		}
	} else if (count < 0) {
		alert('FAIL! count = '+count);
		count++;
	}
}

function startSync () {
	console.log('Start fetching local and Google bookmarks');
	update_ui(stages.FETCHING);
	count++;


	req_stopped = true;
	g_bookmarks = {f: [], bm: []};
	l_bookmarks = {f: [], bm: [], id: '1', g_node: g_bookmarks, label: ''};
	l_bookmarks_map = {'1': l_bookmarks};
	g_bookmarks_changed = []; // dictionary of g_node objects, with url as key
	g_bookmarks_removed = [];
	c_bm_map_g = [];
	g_map_urls = [];

	lastSync = localStorage['lastSync'];
	syncStartTime = new Date().getTime();
	chrome.bookmarks.getChildren('1', getLocalBookmarks); // do it in the background, while google bookmarks are loading.
	req = new XMLHttpRequest();
	req.open (
			    "GET",
				"https://www.google.com/bookmarks/?output=xml&num=100000",
				true);
	req.onreadystatechange = function () {
		if (req.readyState == 4 && req.status != 200) {
			alert('Failed to retrieve bookmarks. Is there an internet connection?');
			decCount(); // I hope parseBookmarks is not called...
			req=readyState = undefined;
		}
	}
	count++;
	req.onload = function() {
		parseBookmarks();
	}
	req.send(null);
}

function stopSync() {
	console.log('Trying to stop synchronizing...');
	update_ui(stages.STOPPING);
	req.abort();
}


function parseBookmarks() {
	try {
		var bookmarks = req.responseXML.childNodes[0].childNodes[0].childNodes;
	} catch (err) {
		alert("Failed to parse bookmarks ("+err.description+") -- are you logged in?");
		decCount();
		return;
	}

	console.log('received Google bookmarks');
	
	var text = '';
	var sub; // sub element of bookmark element, one bookmark node
	for (var i=0, bookmark; bookmark=bookmarks[i]; i++) {
		if (stage == stages.STOPPING) {
			decCount();
			return;
		}
		var g_bookmark = {labels: []};
		for (var j=0; sub=bookmark.childNodes[j]; j++) {
			if (sub.nodeName == 'labels') {
				for (var k=0; labelNode=sub.childNodes[k]; k++) {
					if (labelNode.nodeName != 'label') continue;
					var label = labelNode.childNodes[0].nodeValue;
					g_bookmark.labels.push(label);
					/*if (!(label in g_bookmarks)) {
						g_bookmarks[label] = [];
					}* /
					var sublabels = label.split(localStorage['opt_pathsep'] || '/');
					var g_bmNode = g_bookmarks;
					var sublabel;
					for (var l=0; sublabel=sublabels[l]; l++) {
						if (!(sublabel in g_bmNode.f)) {
							g_bmNode.f[sublabel] = {f: [], bm: [], title: sublabel};
						}
						g_bmNode = g_bmNode.f[sublabel];
					}
					g_bmNode.bm[g_bookmark.url] = g_bookmark;
				}
				continue;
			}
			var key = sub.nodeName;
			var value = sub.childNodes[0].nodeValue;
			if (key == 'url') {
				// strange... but is needed
				value = value.replace(/ /g, '%20');
				g_map_urls[value] = g_bookmark;
			}
			g_bookmark[key] = value;
		}
		if (g_bookmark.labels.length == 0) {
			g_bookmarks.bm[g_bookmark.url] = g_bookmark;
		}
		g_bookmark.time = parseInt(g_bookmark.timestamp)/1000;
	}
	/*c_bm_map_g['1'] = g_bookmarks;
	var blaat = function(cb) {
		syncBookmarks(cb, '1');
	}
	chrome.bookmarks.getChildren('1', blaat);* /

	console.log('Google bookmarks parsed');

	decCount();
}

function getLocalBookmarks(c_bmNodes) {
	// Get local bookmarks in the same kind of array as the Google bookmarks

	if (c_bmNodes.length == 0) {
		decCount();
		return;
	}
	c_parentId = c_bmNodes[0].parentId;
	var node = l_bookmarks_map[c_parentId];
	for (var i=0; c_bmNode=c_bmNodes[i]; i++) {
		if (stage == stages.STOPPING) {
			decCount();
			return;
		}
		if ('url' in c_bmNode) {
			// bookmark
			node.bm[c_bmNode.url] = {
				url:        c_bmNode.url,
				title:      c_bmNode.title,
				id:         c_bmNode.id,
				parentNode: node,
			}
		} else {
			// folder
			node.f[c_bmNode.title] = {
				title:	c_bmNode.title,
				id:	c_bmNode.id,
				parentNode:	node,
				timestamp: c_bmNode.dateAdded,
				f:	[],
				bm:	[],
				label:	(node.label.length?node.label+localStorage['opt_pathSep']:'')+c_bmNode.title,
			}
			l_bookmarks_map[c_bmNode.id] = node.f[c_bmNode.title];
			count++;
			chrome.bookmarks.getChildren(c_bmNode.id, getLocalBookmarks);
		}
	}

	decCount();
}

function syncBookmarks(l_nodes, g_nodes) {
	// now synchronize the bookmarks, now we have the data

	// merge google bookmarks with local bookmarks
	for (var url in g_nodes.bm) {
		if (stage == stages.STOPPING) {
			decCount();
			return;
		}
		var g_node = g_nodes.bm[url];
		var g_id   = g_node.id;
		if (!(url in l_nodes.bm)) {
			if (g_node.time < lastSync) {
				// removed bookmark/label
				markGBmRemoved(g_node, l_nodes.label, g_nodes);
			} else {
				// new bookmark
				console.log('New Google bookmark: '+g_node.url);
				// create bookmark
				chrome.bookmarks.create({'parentId': l_nodes.id,
							'title': g_node.title,
							'url': g_node.url});
			}
		}
		// bookmark does (already) exist
	}
	for (var title in g_nodes.f) {
		if (stage == stages.STOPPING) {
			decCount();
			return;
		}
		var g_node = g_nodes.f[title];
		if (!(title in l_nodes.f)) {
			console.log('New folder: '+title);
			count++;
			chrome.bookmarks.create({'parentId':	l_nodes.id,
						'title':	title}, pullBookmarks);
		} else {
			var l_node = l_nodes.f[title];
			l_node.g_node = g_node;
			count++; // syncBookmarks does decCount at the end
			syncBookmarks(l_node, g_node);
		}
	}

	
	// check for changes to push
	for (var url in l_nodes.bm) {
		var l_node = l_nodes.bm[url];
		if (stage == stages.STOPPING) {
			decCount();
			return;
		}
		if (!(url in g_nodes.bm)) {
			console.log('Not uploaded: '+url+' label: '+getLabel(l_node));
			var label = getLabel(l_node);
			if (url in g_bookmarks_changed) {
				u_node = g_bookmarks_changed[url];
			} else {
				u_node = {title: l_node.title, url: url, timestamp: l_node.timestamp};
			}
			if (label) {
				if (u_node.labels == undefined) {
					u_node.labels = [];
				}
				u_node.labels.push(label);
			}
			g_bookmarks_changed[url] = u_node;
		}
	}

	decCount();
}

function markGBmRemoved(g_node, label, g_nodes) {
	var url = g_node.url;
	var g_id = g_node.id;
	if (g_nodes == g_bookmarks) {
		// top-level bookmarks
		g_bookmarks_removed[g_id] = g_node;
		if (g_bookmarks_changed[url]) {
			delete g_bookmarks_changed[url];
			}
	} else {
		// nested bookmarks
		deleteArrayElement(g_node.labels, label);
		if (g_nodes.labels.length) {
			// if there are more labels, change it
			g_bookmarks_changed[url] = g_node;
		} else {
			// remove this bookmark
			g_bookmarks_removed[g_id] = g_node;
			if (g_bookmarks_changed[url]) {
				delete g_bookmarks_changed[url];
			}
		}
	}
	console.log('Removed Google bookmark: '+g_node.url);
}

function pullBookmarks(c_folder_node) {
	// TODO, copy bookmarks from google bookmarks to here (to an empty folder)
	// TODO check for empty folder afterwards (or TODO do it a better way)
	var l_parentNode = l_bookmarks_map[c_folder_node.parentId];
	var c_parentId = c_folder_node.id
	var g_nodes = l_parentNode.g_node.f[c_folder_node.title];
	l_bookmarks_map[c_folder_node.id] = l_node = {g_node: g_nodes, label: (l_parentNode.label?l_parentNode.label+'/':'')+c_folder_node.title}; // g_node is the only requested attribute
	console.log('Pull bookmarks: '+g_nodes.title);
	for (var url in g_nodes.bm) {
		if (stage == stages.STOPPING) {
			decCount();
			return;
		}
		var g_node = g_nodes.bm[url];
		if (g_node.time < lastSync) {
			markGBmRemoved(g_node, l_node.label, g_nodes);
		} else {
			chrome.bookmarks.create({'parentId':	c_parentId,
						'title':	g_node.title,
						'url':		url,	});
		}
	}
	for (var title in g_nodes.f) {
		if (stage == stages.STOPPING) {
			decCount();
			return;
		}
		var g_node = g_nodes.f[title];
		count++;
		chrome.bookmarks.create({'parentId':	c_parentId,
					'title':	g_node.title,	},
					pullBookmarks);
	}
	decCount();
}

function getLabel(node) {
	// get the label of a bookmark
	var label = '';
	while (true) {
		if (node.parentNode && node.parentNode.title) {
			label = node.parentNode.title+(label?localStorage["opt_pathsep"]+label:'');
		} else {
			break;
		}
		node = node.parentNode;
	} return label; }

function withSignature(callback) {
	if (signature) {
		callback();
	} else {
		var sigget = new XMLHttpRequest();
		sigget.open("GET", 'https://www.google.com/bookmarks/mark?op=edit&output=popup', true);
		sigget.onreadystatechange = function () {
			if (sigget.readyState == 4) {
				if (sigget.status != 200) {
					console.log("Failed to get signature key:");
					console.log(sigget);
					decCount();
					return;
				}
				var response = sigget.response;
				var start = response.indexOf('name=sig value="')+16;
				var stop = response.indexOf('">', start);
				signature = response.slice(start, stop);
				console.log('got signature');
				callback();
				decCount();
			}
		}
		count++;
		sigget.send(null);
	}
}

function uploadChanges() {
	withSignature(doUploadChanges);
}

function doUploadChanges() {
	removeGoogleBookmarks();
	for (url in g_bookmarks_changed) {
		doUploadSingleUrl(url);
	}
	decCount();
}
function doUploadSingleUrl(url) {
	// in new function because of the scope
	var node = g_bookmarks_changed[url];
	var http = new XMLHttpRequest();
	http.open("POST", 'https://www.google.com/bookmarks/mark', true);
	var fixed_url = url;
	/ *if (url.slice(0,9) == 'javascript:') {
		// a hack to allow bookmarklets.
		// Copied from GMarks, from the file components/nsIGmarksCom_google.js
		bm.notes = bm.url;
		bm.url = this.BKMKLET_URL+"&str=";
		/* add a random string to make a unique url * /
		var chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz".split("");
		var string_length=40;
		for (var i=0; i<string_length; i++) {
			var idx = Math.floor(Math.random() * chars.length);
			bm.url += chars[idx];//chars.substring(rnum,rnum+1);
		}
	}* /
	var params = 'bkmk='+escape(fixed_url)+'&prev=/lookup&title='+escape(node.title)+'&labels='+escape((node.labels || []).join(','))+'&sig='+signature;
	http.onreadystatechange = function (evt) {
		if (http.readyState == 4) {
			if (http.status != 200) {
				console.log(http);
			}
			console.log('sent bookmark: '+url);
			decCount();
		}
	}
	count++;
	http.send(params);
}

// remove all old Google bookmarks from the server
function removeGoogleBookmarks() {
	var ids = [];
	for (url in g_bookmarks_removed) {
		// TODO some better way
		ids.push(g_bookmarks_removed[url].id);
	}
	if (!ids.length) return;
	
	console.log('Removing old bookmarks on the server...');
	var id = ids[0];

	var http = new XMLHttpRequest();
	http.open('POST', 'https://www.google.com/bookmarks/mark?dlq='+ids[0]+'&s='+signature, true);
	var params = 'td='+escape(JSON.stringify({"deleteAllBookmarks":false,"deleteAllThreads":false,"urls":[],"ids":ids}));
	http.onreadystatechange = function (evt) {
		if (http.readyState == 4) {
			if (http.status != 200) {
				console.log(http);
			} else {
				console.log('removed google bookmarks.');
			}
			delete g_bookmarks_removed[id];
			removeGoogleBookmarks();
			decCount();
		}
	}
	count++;
	http.send(params);
}

// with contribution to: http://www.mmartins.com/mmartins/googlebookmarksapi/googlebookmarksapixmlupload.html
function uploadChangesXML() {
	var xml = '"1.0" encoding="utf-8"?><bookmarks>';
	var node;
	var label;
	for (url in g_bookmarks_to_upload) {
		node = g_bookmarks_to_upload[url];
		xml += '<bookmark><url>'+escapeHtml(node.url)+'</url><title>'+escapeHtml(node.title)+'</title>';
		if (node.labels) {
			xml += '<labels>';
			for (var j=0; label=node.labels[j]; j++) {
				xml += '<label>'+escapeHtml(label)+'</label>';
			}
			xml += '</labels>';
		}
	}
	xml += '</bookmarks>';
	/ * To delete bookmarks (ids or urls):
	   url: ??
	   payload (POST data): ???={"deleteAllBookmarks":false,"deleteAllThreads":false,"urls":[],"ids":["NDQAAAAAQnKGiv_XApwIg54uNu6e1sNacAQ","NDQAAAAAQz56ouPXApwIg053FmsHO6ZYc","NDQAAAAAQkveuu_XApwIguavysKvTi-atAQ"]}i
	   	(payload encoded as urls are encoded, %22 etc.)

	   To delete a label:
	   url: https://www.google.com/bookmarks/api/bookmark?op=DELETE_LABELS&label=abc
	   response: 1 (one character)
	* /
	alert(xml);
	var http = new XMLHttpRequest();
	http.open("POST", 'http://www.google.com/bookmarks/mark?op=upload', true);
	http.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
	http.onload = function (abc) {
		alert(abc);
	}
	http.onreadystatechange = function (x) {
		console.log(x+'...'+http.readyState+'...'+http.status);
	}
	http.send('<xml version='+escape(xml)); // yes, send raw xml as query string. This is the way Google handles bookmarks...
	decCount();
}

// http://stackoverflow.com/questions/1787322/htmlspecialchars-equivalent-in-javascript
function escapeHtml(unsafe) {
  return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
}

// http://www.roseindia.net/java/javascript-array/javascript-remove-an-element.shtml
function deleteArrayElement(arrayName, arrayElement)
 {
    for(var i=0; i<arrayName.length;i++ )
     { 
        if(arrayName[i] == arrayElement)
            arrayName.splice(i, 1); 
      } 
  }

/*function syncBookmarks(c_bmNodes) {
	// recursively walk through the bookmarks here

	if (c_bmNodes.length == 0) return;
	c_parent = c_bmNodes[0].parentId;

	var g_bmNodes = c_bm_map_g[c_parent];
	var text = '';
	
	var g_bmNode;

	// get local bookmarks in a simple array
	var bmNodes = {bm: [], f: []};
	for (var i=0; c_bmNode=c_bmNodes[i]; i++) {
		var bmNode = {
			title: c_bmNode.title,
			timestamp: c_bmNode.dateAdded,
			id: c_bmNode.id,
		}
		if (c_bmNode.url) {
			// bookmark
			bmNodes.bm[c_bmNode.url] = bmNode;
		} else {
			// folder
			bmNodes.f[c_bmNode.title] = bmNode;
		}
	}

	// merge google bookmarks with local bookmarks
	// iterate over bookmarks
	for (url in g_bmNodes.bm) {
		g_bmNode = g_bmNodes.bm[url];
		if (!(g_bmNode.url in bmNodes.bm)) {
			console.log('Create bookmark: '+g_bmNode.url);
			// create bookmark
			chrome.bookmarks.create({'parentId': c_parent,
						'title': g_bmNode.title,
						'url': g_bmNode.url});
		}
	}
	// iterate over folders
	for (var title in g_bmNodes.f) {
		var g_bmNode = g_bmNodes.f[title];
		if (!(title in bmNodes.f)) { // does the folder exist?
			// create folder
			var current_g_bmNode = g_bmNode;
			chrome.bookmarks.create({'parentId': c_parent,
						'title': title}, function(cb) {
							var id = cb.id;
							//c_bm_map_g[id] = current_g_bmNode;
							console.log('created folder: '+cb.title);
							c_bm_map_g[id] = c_bm_map_g[cb.parentId].f[cb.title];
							chrome.bookmarks.getChildren(id, syncBookmarks); } );
		} else {
			// folder does already exist
			c_bm_map_g[bmNodes.f[title].id] = g_bmNode;
			chrome.bookmarks.getChildren(bmNodes.f[title].id, syncBookmarks);
		}
	}

	// get local nodes that are not in Google bookmarks
	/ *for (var i=0; node=bmNodes[i]; i++) {
		var bmNode = bmNodes[i]
		for (key in bmNode) {
			text += key+'\n';
			text += bmNode[key]+'\n';
		}
		if (node.url == undefined) {
			// folder
			//chrome.bookmarks.getChildren(bmNode.id, function(cb) {syncBookmarks(cb, g_bmNode);});
		} else {
			// url
			if (!(bmNode.title in g_bmNodes.bm)) {
				console.log('To push: '+bmNode.title);
			}
		}
		text += '\n';
	}* /
	console.log('finished '+c_parent+'.');
} */
