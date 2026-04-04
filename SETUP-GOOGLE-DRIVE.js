// =====================================================
// GOOGLE APPS SCRIPT — Google Drive Integration
// =====================================================
// Deploy this as a Web App in Google Apps Script
//
// SETUP STEPS:
// 1. Go to https://script.google.com → New Project
// 2. Name it "NW Drive Proxy"
// 3. Paste ALL the code below into Code.gs (replace everything)
// 4. Click Deploy → New deployment
// 5. Type: Web app
// 6. Execute as: Me
// 7. Who has access: Anyone
// 8. Click Deploy → Copy the Web App URL
// 9. Give the URL to Claude to put into the app
//
// FIRST TIME: The script will auto-create a root folder
// called "Northern Wolves Projects" in your Google Drive.
// All project folders and files go inside it.
// =====================================================

// ─── Root folder name ───
var ROOT_FOLDER_NAME = 'Northern Wolves Projects';

// ─── Category subfolder names ───
var CATEGORIES = ['Drawings', 'Submittals', 'Manuals', 'Warranties', 'Reports', 'Other'];

// ─── Get or create root folder ───
function getRootFolder() {
  var folders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(ROOT_FOLDER_NAME);
}

// ─── Get or create a project folder with category subfolders ───
function getProjectFolder(projectName, projectId) {
  var root = getRootFolder();
  // Use projectId as folder identifier to avoid duplicates
  var folderName = projectName;

  // Search by description containing projectId
  var folders = root.getFolders();
  while (folders.hasNext()) {
    var f = folders.next();
    if (f.getDescription() === projectId) {
      return f;
    }
  }

  // Create new project folder
  var projectFolder = root.createFolder(folderName);
  projectFolder.setDescription(projectId);

  // Create category subfolders
  for (var i = 0; i < CATEGORIES.length; i++) {
    projectFolder.createFolder(CATEGORIES[i]);
  }

  return projectFolder;
}

// ─── Get category subfolder ───
function getCategoryFolder(projectFolder, category) {
  var catName = capitalize(category);
  var folders = projectFolder.getFoldersByName(catName);
  if (folders.hasNext()) {
    return folders.next();
  }
  // Create if missing
  return projectFolder.createFolder(catName);
}

function capitalize(str) {
  if (!str) return 'Other';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ─── List all files in a project folder (all categories) ───
function listProjectFiles(projectName, projectId) {
  var root = getRootFolder();
  var projectFolder = null;

  var folders = root.getFolders();
  while (folders.hasNext()) {
    var f = folders.next();
    if (f.getDescription() === projectId) {
      projectFolder = f;
      break;
    }
  }

  if (!projectFolder) {
    return { success: true, files: [] };
  }

  var allFiles = [];

  // Get files from each category subfolder
  var subFolders = projectFolder.getFolders();
  while (subFolders.hasNext()) {
    var sub = subFolders.next();
    var catName = sub.getName().toLowerCase();
    var files = sub.getFiles();
    while (files.hasNext()) {
      var file = files.next();
      allFiles.push({
        id: file.getId(),
        name: file.getName(),
        category: catName,
        size: file.getSize(),
        mimeType: file.getMimeType(),
        createdAt: file.getDateCreated().toISOString(),
        url: file.getUrl(),
        downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
        viewUrl: file.getUrl()
      });
    }
  }

  // Also get files directly in project folder (uncategorized)
  var directFiles = projectFolder.getFiles();
  while (directFiles.hasNext()) {
    var file = directFiles.next();
    allFiles.push({
      id: file.getId(),
      name: file.getName(),
      category: 'other',
      size: file.getSize(),
      mimeType: file.getMimeType(),
      createdAt: file.getDateCreated().toISOString(),
      url: file.getUrl(),
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
      viewUrl: file.getUrl()
    });
  }

  // Sort by date descending
  allFiles.sort(function(a, b) {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });

  return { success: true, files: allFiles };
}

// ─── Upload a file (base64) to a project's category folder ───
function uploadFile(projectName, projectId, fileName, base64Data, mimeType, category) {
  var projectFolder = getProjectFolder(projectName, projectId);
  var catFolder = getCategoryFolder(projectFolder, category || 'other');

  // Decode base64
  var decoded = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(decoded, mimeType || 'application/octet-stream', fileName);

  var file = catFolder.createFile(blob);

  // Make file viewable by anyone with link (needed for photo previews in the app)
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    success: true,
    file: {
      id: file.getId(),
      name: file.getName(),
      category: (category || 'other').toLowerCase(),
      size: file.getSize(),
      mimeType: file.getMimeType(),
      createdAt: file.getDateCreated().toISOString(),
      url: file.getUrl(),
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId(),
      viewUrl: file.getUrl(),
      directUrl: 'https://lh3.googleusercontent.com/d/' + file.getId()
    }
  };
}

// ─── Delete a file by ID ───
function deleteFile(fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    file.setTrashed(true);
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ─── Rename project folder ───
function renameProjectFolder(projectId, newName) {
  var root = getRootFolder();
  var folders = root.getFolders();
  while (folders.hasNext()) {
    var f = folders.next();
    if (f.getDescription() === projectId) {
      f.setName(newName);
      return { success: true };
    }
  }
  return { success: false, error: 'Project folder not found' };
}

// ─── Delete project folder ───
function deleteProjectFolder(projectId) {
  var root = getRootFolder();
  var folders = root.getFolders();
  while (folders.hasNext()) {
    var f = folders.next();
    if (f.getDescription() === projectId) {
      f.setTrashed(true);
      return { success: true };
    }
  }
  return { success: false, error: 'Project folder not found' };
}

// ─── Web App entry points ───

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'ok',
    service: 'NW Drive Proxy',
    version: '1.0'
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var result;

    switch (action) {
      case 'list_files':
        result = listProjectFiles(body.projectName, body.projectId);
        break;

      case 'upload_file':
        result = uploadFile(
          body.projectName,
          body.projectId,
          body.fileName,
          body.fileData,
          body.mimeType,
          body.category
        );
        break;

      case 'delete_file':
        result = deleteFile(body.fileId);
        break;

      case 'rename_project':
        result = renameProjectFolder(body.projectId, body.newName);
        break;

      case 'delete_project':
        result = deleteProjectFolder(body.projectId);
        break;

      case 'create_project':
        var folder = getProjectFolder(body.projectName, body.projectId);
        result = { success: true, folderId: folder.getId() };
        break;

      default:
        result = { success: false, error: 'Unknown action: ' + action };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
