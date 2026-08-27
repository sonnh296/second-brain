"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  FileText,
  FileType,
  File,
  Upload,
  Plus,
  Search,
  LayoutGrid,
  List,
  Tag,
  Folder as FolderIcon,
  FolderPlus,
  ChevronLeft,
  Trash2,
  RotateCcw,
  StickyNote,
  Sparkles,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DriveGridItem,
  DriveListItem,
  DocumentThumb,
} from "@/components/documents/document-grid";
import { DocumentPreviewPanel, getContentEditState } from "@/components/documents/document-preview-panel";
import { NoteModal } from "@/components/documents/note-modal";
import { UploadModal } from "@/components/documents/upload-modal";
import { TagManager } from "@/components/documents/tag-manager";
import { FileIcon } from "@/components/documents/file-icon";
import type {
  TypeFilter,
  StatusFilter,
  SortBy,
  ViewMode,
  PreviewData,
  NoteModalState,
} from "@/components/documents/types";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { MarkdownContent } from "@/components/markdown-content";
import { Textarea } from "@/components/ui/textarea";
import { useTranslations } from "next-intl";
import {
  FolderGridItem,
  FolderListItem,
  FolderBreadcrumb,
  FolderPicker,
} from "@/components/documents/folder-items";
import { useDocumentPolling } from "@/hooks/use-document-polling";
import { useTrash } from "@/hooks/use-trash";
import {
  TYPE_LABELS,
  isImageType,
  MAX_FOLDER_DESCRIPTION_LENGTH,
} from "@/lib/upload/file-types";
import { canReuploadDocument } from "@/lib/documents/can-reupload";
import {
  beginLibraryDocDrag,
  endLibraryDocDrag,
} from "@/lib/documents/library-drag";
import {
  putToR2WithProgress,
  waitForDocumentProcessing,
} from "@/lib/upload/put-with-progress";
import { formatBytes } from "@/lib/usage/format";
import type {
  Document,
  Tag as TagType,
  Folder,
  DocumentStatus,
} from "@/lib/db/types";

type DocStatus = DocumentStatus;

const TYPE_LABELS_LOCAL = TYPE_LABELS;

const STATUS_LABELS: Record<DocStatus, string> = {
  done: "Sẵn sàng",
  pending: "Chờ xử lý",
  processing: "Đang xử lý",
  failed: "Lỗi",
};

const SIDEBAR_TYPES: {
  id: TypeFilter;
  labelKey: "all" | "favorites" | "notes" | "pdf" | "word" | "text";
  icon: React.ReactNode;
}[] = [
  { id: "all", labelKey: "all", icon: <File className="h-4 w-4" /> },
  {
    id: "favorite",
    labelKey: "favorites",
    icon: <Star className="h-4 w-4 text-amber-500" />,
  },
  {
    id: "note",
    labelKey: "notes",
    icon: <FileText className="h-4 w-4 text-fuchsia-500" />,
  },
  {
    id: "pdf",
    labelKey: "pdf",
    icon: <FileText className="h-4 w-4 text-red-500" />,
  },
  {
    id: "docx",
    labelKey: "word",
    icon: <FileType className="h-4 w-4 text-blue-500" />,
  },
  {
    id: "txt",
    labelKey: "text",
    icon: <FileText className="h-4 w-4 text-muted-foreground" />,
  },
];

export default function DocumentsPage() {
  const td = useTranslations("documents");
  const tc = useTranslations("common");
  const { confirm, confirmChoice, dialog: confirmDialog } = useConfirm();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadTagIds, setUploadTagIds] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [reuploadDoc, setReuploadDoc] = useState<Document | null>(null);
  const [tags, setTags] = useState<TagType[]>([]);
  const [tagFilter, setTagFilter] = useState<string | "all">("all");
  const [showTagManager, setShowTagManager] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [allFolders, setAllFolders] = useState<Folder[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<
    { id: string | null; name: string }[]
  >([{ id: null, name: "Gốc" }]);

  useEffect(() => {
    setBreadcrumb((prev) => {
      if (prev.length === 1 && prev[0].id === null) {
        return [{ id: null, name: td("root") }];
      }
      if (prev[0]?.id === null) {
        return [{ id: null, name: td("root") }, ...prev.slice(1)];
      }
      return prev;
    });
  }, [td]);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDescription, setNewFolderDescription] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<Folder | null>(null);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [renameFolderDescription, setRenameFolderDescription] = useState("");
  const [renameFolderError, setRenameFolderError] = useState("");
  const [savingFolderName, setSavingFolderName] = useState(false);
  const [editingFolderDescription, setEditingFolderDescription] = useState<Folder | null>(null);
  const [folderDescriptionDraft, setFolderDescriptionDraft] = useState("");
  const [folderDescriptionError, setFolderDescriptionError] = useState("");
  const [savingFolderDescription, setSavingFolderDescription] = useState(false);
  const [reprocessingOcr, setReprocessingOcr] = useState(false);
  const [keepingWeakOcr, setKeepingWeakOcr] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [docSelectionMode, setDocSelectionMode] = useState(false);
  const [folderSelectionMode, setFolderSelectionMode] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const selectionAnchorIdRef = useRef<string | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string | null>(null);
  const [movingDocs, setMovingDocs] = useState(false);
  const [moveError, setMoveError] = useState("");
  const [moveFolderDialogOpen, setMoveFolderDialogOpen] = useState(false);
  const [moveFolderTargetId, setMoveFolderTargetId] = useState<string | null>(null);
  const [movingFolders, setMovingFolders] = useState(false);
  const [moveFolderError, setMoveFolderError] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [noteModal, setNoteModal] = useState<NoteModalState | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [panelSaveError, setPanelSaveError] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editContent, setEditContent] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [trashMode, setTrashMode] = useState(false);
  const [deletingDocIds, setDeletingDocIds] = useState<string[]>([]);
  const [deletingFolderIds, setDeletingFolderIds] = useState<string[]>([]);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [summaryError, setSummaryError] = useState("");

  useEffect(() => {
    if (!addMenuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (
        addMenuRef.current &&
        !addMenuRef.current.contains(e.target as Node)
      ) {
        setAddMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [addMenuOpen]);

  function markDeletingDoc(id: string) {
    setDeletingDocIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function unmarkDeletingDoc(id: string) {
    setDeletingDocIds((prev) => prev.filter((x) => x !== id));
  }

  function markDeletingFolder(id: string) {
    setDeletingFolderIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function unmarkDeletingFolder(id: string) {
    setDeletingFolderIds((prev) => prev.filter((x) => x !== id));
  }

  const fetchTags = useCallback(async () => {
    const res = await fetch("/api/tags");
    if (res.ok) setTags(await res.json());
  }, []);

  const fetchAllFolders = useCallback(async () => {
    const res = await fetch("/api/folders?all=1");
    if (res.ok) setAllFolders(await res.json());
  }, []);

  const fetchFolders = useCallback(async (parentId: string | null) => {
    const q = parentId ? `?parent_id=${parentId}` : "?parent_id=root";
    const res = await fetch(`/api/folders${q}`);
    if (res.ok) setFolders(await res.json());
  }, []);

  const loadBreadcrumb = useCallback(async (folderId: string | null) => {
    if (!folderId) {
      setBreadcrumb([{ id: null, name: td("root") }]);
      return;
    }
    const res = await fetch(`/api/folders/${folderId}`);
    if (res.ok) {
      const data = await res.json();
      setBreadcrumb([{ id: null, name: td("root") }, ...data.breadcrumb]);
    }
  }, [td]);

  const fetchDocuments = useCallback(async (folderId: string | null, favorite = false) => {
    const q = favorite
      ? "?favorite=1"
      : folderId
        ? `?folder_id=${folderId}`
        : "?folder_id=root";
    const res = await fetch(`/api/documents${q}`);
    if (res.ok) setDocuments(await res.json());
  }, []);

  const refreshFolderView = useCallback(
    async (folderId: string | null) => {
      const favorite = typeFilter === "favorite";
      if (favorite) {
        await Promise.all([fetchDocuments(null, true), fetchAllFolders()]);
        return;
      }
      await Promise.all([
        fetchFolders(folderId),
        fetchDocuments(folderId),
        loadBreadcrumb(folderId),
        fetchAllFolders(),
      ]);
    },
    [fetchFolders, fetchDocuments, loadBreadcrumb, fetchAllFolders, typeFilter],
  );

  useEffect(() => {
    Promise.all([refreshFolderView(currentFolderId), fetchTags()]).finally(() =>
      setLoading(false),
    );
  }, [currentFolderId, typeFilter, refreshFolderView, fetchTags]);

  useDocumentPolling(documents, setDocuments);

  const onTrashRestored = useCallback(() => {
    return refreshFolderView(currentFolderId);
  }, [refreshFolderView, currentFolderId]);

  const { trashDocs, trashLoading, trashAction, restoreDoc, purgeDoc, fetchTrash } =
    useTrash(trashMode, confirm, onTrashRestored);

  useEffect(() => {
    // Switching trash mode should reset multi-selection to avoid confusing actions.
    setSelectedDocIds([]);
    setDocSelectionMode(false);
    selectionAnchorIdRef.current = null;
    setSelectedDoc(null);
    setPreview(null);
  }, [trashMode]);

  useEffect(() => {
    // Switching filters/folder changes the visible dataset.
    setSelectedDocIds([]);
    setDocSelectionMode(false);
    selectionAnchorIdRef.current = null;
    setSelectedDoc(null);
    setPreview(null);
  }, [currentFolderId, typeFilter, statusFilter, searchQuery]);

  useEffect(() => {
    if (!folderSelectionMode) return
    // If user deselects everything, exit selection mode.
    if (selectedFolderIds.length === 0) setFolderSelectionMode(false)
  }, [folderSelectionMode, selectedFolderIds.length])

  useEffect(() => {
    const hasSelection =
      folderSelectionMode ||
      docSelectionMode ||
      selectedDocIds.length > 0 ||
      selectedFolderIds.length > 0;
    if (!hasSelection) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setFolderSelectionMode(false)
        setSelectedFolderIds([])
        setDocSelectionMode(false)
        setSelectedDocIds([])
        selectionAnchorIdRef.current = null
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [folderSelectionMode, docSelectionMode, selectedDocIds.length, selectedFolderIds.length])

  function toggleFolderSelection(folderId: string) {
    setFolderSelectionMode(true)
    setSelectedFolderIds((prev) => {
      if (prev.includes(folderId)) return prev.filter((id) => id !== folderId)
      return [...prev, folderId]
    })
    // Ensure we don't have doc + folder multi-select at the same time.
    setDocSelectionMode(false)
    setSelectedDocIds([])
    setSelectedDoc(null)
    setPreview(null)
    setPreviewLoading(false)
    selectionAnchorIdRef.current = null
  }

  function toggleDocSelection(docId: string) {
    setDocSelectionMode(true)
    setSelectedDocIds((prev) => {
      if (prev.includes(docId)) return prev.filter((id) => id !== docId)
      return [...prev, docId]
    })
    selectionAnchorIdRef.current = docId
    // Ensure we don't have doc + folder multi-select at the same time.
    setFolderSelectionMode(false)
    setSelectedFolderIds([])
    setSelectedDoc(null)
    setPreview(null)
    setPreviewLoading(false)
  }

  // Keep selected doc in sync with polling status updates, and refresh subtitle preview when done.
  useEffect(() => {
    if (!selectedDoc) return;
    const latest = documents.find((d) => d.id === selectedDoc.id);
    if (!latest) return;

    if (
      latest.status !== selectedDoc.status ||
      latest.chunk_count !== selectedDoc.chunk_count ||
      latest.error_message !== selectedDoc.error_message
    ) {
      setSelectedDoc(latest);
      if (latest.status === "done" || latest.status === "failed") {
        fetch(`/api/documents/${latest.id}/preview`).then(async (res) => {
          if (res.ok) setPreview(await res.json());
        });
      }
    }
  }, [documents, selectedDoc]);

  function navigateToFolder(folderId: string | null) {
    setCurrentFolderId(folderId);
    closePreview();
    setSelectedDocIds([]);
    setDocSelectionMode(false);
    selectionAnchorIdRef.current = null;
    setFolderSelectionMode(false);
    setSelectedFolderIds([]);
    setLoading(true);
  }

  async function createFolder() {
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newFolderName.trim(),
        description: newFolderDescription.trim() || null,
        parent_id: currentFolderId,
      }),
    });
    setCreatingFolder(false);
    if (res.ok) {
      setNewFolderName("");
      setNewFolderDescription("");
      setShowNewFolder(false);
      await refreshFolderView(currentFolderId);
    }
  }

  function openRenameFolder(folder: Folder) {
    setRenamingFolder(folder);
    setRenameFolderName(folder.name);
    setRenameFolderDescription(folder.description ?? "");
    setRenameFolderError("");
  }

  function closeRenameFolder() {
    if (savingFolderName) return;
    setRenamingFolder(null);
    setRenameFolderName("");
    setRenameFolderDescription("");
    setRenameFolderError("");
  }

  function openEditFolderDescription(folder: Folder) {
    setEditingFolderDescription(folder);
    setFolderDescriptionDraft(folder.description ?? "");
    setFolderDescriptionError("");
  }

  function closeEditFolderDescription() {
    if (savingFolderDescription) return;
    setEditingFolderDescription(null);
    setFolderDescriptionDraft("");
    setFolderDescriptionError("");
  }

  async function saveFolderDescription() {
    if (!editingFolderDescription) return;
    setSavingFolderDescription(true);
    setFolderDescriptionError("");

    const res = await fetch(`/api/folders/${editingFolderDescription.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: folderDescriptionDraft.trim() || null,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setFolderDescriptionError(data.error ?? "Không thể lưu mô tả thư mục");
      setSavingFolderDescription(false);
      return;
    }

    setSavingFolderDescription(false);
    setEditingFolderDescription(null);
    setFolderDescriptionDraft("");
    await refreshFolderView(currentFolderId);
  }

  async function renameFolder() {
    if (!renamingFolder || !renameFolderName.trim()) return;
    setSavingFolderName(true);
    setRenameFolderError("");
    const res = await fetch(`/api/folders/${renamingFolder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: renameFolderName.trim(),
        description: renameFolderDescription.trim() || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setRenameFolderError(data.error ?? td("renameFolderFailed"));
      setSavingFolderName(false);
      return;
    }

    setSavingFolderName(false);
    setRenamingFolder(null);
    setRenameFolderName("");
    setRenameFolderDescription("");
    await refreshFolderView(currentFolderId);
  }

  async function deleteFolder(folderId: string) {
    const ok = await confirm({
      title: "Xóa thư mục?",
      description: "Tài liệu bên trong sẽ chuyển về thư mục gốc.",
      confirmLabel: "Xóa thư mục",
    });
    if (!ok) return;
    markDeletingFolder(folderId);
    try {
      await fetch(`/api/folders/${folderId}`, { method: "DELETE" });
      if (currentFolderId === folderId) navigateToFolder(null);
      else await refreshFolderView(currentFolderId);
    } finally {
      unmarkDeletingFolder(folderId);
    }
  }

  async function moveFoldersToParent(targetParentId: string | null, folderIds: string[]) {
    if (folderIds.length === 0) return
    setMovingFolders(true)
    setMoveFolderError("")
    try {
      const results = await Promise.all(
        folderIds.map(async (id) => {
          const res = await fetch(`/api/folders/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ parent_id: targetParentId }),
          })
          return { id, ok: res.ok }
        }),
      )
      const failed = results.filter((r) => !r.ok)
      if (failed.length > 0) {
        setMoveFolderError(`Không thể di chuyển ${failed.length} thư mục`)
        return
      }
      setSelectedFolderIds([])
      setFolderSelectionMode(false)
      await refreshFolderView(currentFolderId)
    } finally {
      setMovingFolders(false)
    }
  }

  async function bulkDeleteSelectedFolders() {
    if (selectedFolderIds.length === 0) return
    const ids = [...selectedFolderIds]

    const ok = await confirm({
      title: `Xóa ${ids.length} thư mục?`,
      description: "Tài liệu bên trong sẽ chuyển về thư mục gốc.",
      confirmLabel: "Xóa thư mục",
    })
    if (!ok) return

    setDeletingFolderIds((prev) => Array.from(new Set([...prev, ...ids])))
    try {
      await Promise.all(ids.map((id) => fetch(`/api/folders/${id}`, { method: "DELETE" })))

      setSelectedFolderIds([])
      setFolderSelectionMode(false)
      closePreview()
      setSelectedDocIds([])
      selectionAnchorIdRef.current = null

      if (currentFolderId && ids.includes(currentFolderId)) {
        navigateToFolder(null)
      } else {
        await refreshFolderView(currentFolderId)
      }
    } finally {
      setDeletingFolderIds((prev) => prev.filter((id) => !ids.includes(id)))
    }
  }

  useEffect(() => {
    if (selectedDoc) {
      setPanelSaveError("");
      setEditName(selectedDoc.filename);
      setEditDescription(selectedDoc.description ?? "");
      setSelectedTagIds(selectedDoc.tags?.map((t) => t.id) ?? []);
    }
  }, [selectedDoc]);

  useEffect(() => {
    setEditContent(preview?.content ?? "");
  }, [preview?.content, selectedDoc?.id]);

  const filteredDocs = useMemo(() => {
    let result = [...documents];
    if (typeFilter === "favorite") {
      result = result.filter((d) => d.is_favorite);
    } else if (typeFilter !== "all") {
      result = result.filter((d) => d.file_type === typeFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter((d) => d.status === statusFilter);
    }
    if (tagFilter !== "all") {
      result = result.filter((d) => d.tags?.some((t) => t.id === tagFilter));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          d.filename.toLowerCase().includes(q) ||
          (d.description?.toLowerCase().includes(q) ?? false) ||
          (d.tags?.some((t) => t.name.toLowerCase().includes(q)) ?? false),
      );
    }
    result.sort((a, b) => {
      if (sortBy === "name") return a.filename.localeCompare(b.filename, "vi");
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
    return result;
  }, [documents, typeFilter, statusFilter, tagFilter, searchQuery, sortBy]);

  const visibleFolders = useMemo(() => {
    if (typeFilter === "favorite") return [];
    if (!searchQuery.trim()) return folders;
    const q = searchQuery.toLowerCase();
    return folders.filter(
      (folder) =>
        folder.name.toLowerCase().includes(q) ||
        (folder.description?.toLowerCase().includes(q) ?? false),
    );
  }, [folders, searchQuery, typeFilter]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: documents.length,
      favorite: documents.filter((d) => d.is_favorite).length,
    };
    for (const d of documents) {
      counts[d.file_type] = (counts[d.file_type] ?? 0) + 1;
    }
    return counts;
  }, [documents]);

  async function toggleFavorite(doc: Document) {
    const next = !doc.is_favorite;
    setDocuments((prev) =>
      prev.map((d) => (d.id === doc.id ? { ...d, is_favorite: next } : d)),
    );
    if (selectedDoc?.id === doc.id) {
      setSelectedDoc({ ...selectedDoc, is_favorite: next });
    }
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_favorite: next }),
    });
    if (!res.ok) {
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === doc.id ? { ...d, is_favorite: doc.is_favorite } : d,
        ),
      );
      if (selectedDoc?.id === doc.id) {
        setSelectedDoc({ ...selectedDoc, is_favorite: doc.is_favorite });
      }
    } else if (typeFilter === "favorite" && !next) {
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    }
  }

  function openReupload(doc: Document) {
    setReuploadDoc(doc);
    setSelectedFile(null);
    setUploadDescription("");
    setUploadTagIds([]);
    setUploadError("");
    setUploadProgress(null);
    setShowNewFolder(false);
    setShowUploadModal(true);
  }

  function closeUploadModal() {
    if (uploading) return;
    setShowUploadModal(false);
    setSelectedFile(null);
    setUploadDescription("");
    setUploadTagIds([]);
    setUploadError("");
    setUploadProgress(null);
    setReuploadDoc(null);
  }

  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError("");
    setUploadProgress(0);

    try {
      const presignRes = await fetch(
        reuploadDoc
          ? `/api/documents/${reuploadDoc.id}/reupload`
          : "/api/upload/presign",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            reuploadDoc
              ? {
                  filename: selectedFile.name,
                  size: selectedFile.size,
                }
              : {
                  filename: selectedFile.name,
                  size: selectedFile.size,
                  description: uploadDescription.trim() || undefined,
                  folder_id: currentFolderId ?? undefined,
                },
          ),
        },
      );
      const presign = await presignRes.json();
      if (!presignRes.ok) {
        throw new Error(presign.error ?? "Upload failed");
      }

      await putToR2WithProgress(
        presign.upload_url,
        selectedFile,
        presign.content_type,
        setUploadProgress,
      );

      const completeUrl = reuploadDoc
        ? `/api/documents/${reuploadDoc.id}/reupload/complete`
        : "/api/upload/complete";
      let completeRes = await fetch(completeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: presign.document_id }),
      });
      if (!completeRes.ok && completeRes.status === 400) {
        await new Promise((r) => setTimeout(r, 1500));
        completeRes = await fetch(completeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document_id: presign.document_id }),
        });
      }
      const complete = await completeRes.json();
      if (!completeRes.ok) {
        throw new Error(complete.error ?? "Upload failed");
      }

      if (!reuploadDoc && uploadTagIds.length > 0) {
        await fetch(`/api/documents/${presign.document_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag_ids: uploadTagIds }),
        });
      }

      const isMedia = /\.(mp4|mov|mp3|wav)$/i.test(selectedFile.name);
      if (isMedia && !reuploadDoc) {
        await waitForDocumentProcessing(presign.document_id);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
      setUploading(false);
      return;
    }

    setUploading(false);
    setUploadProgress(null);
    setUploadDescription("");
    setUploadTagIds([]);
    setSelectedFile(null);
    setReuploadDoc(null);
    setShowUploadModal(false);
    await refreshFolderView(currentFolderId);
  }

  function openCreateNoteModal() {
    setNoteModal({ mode: "create" });
    setNoteTitle("");
    setNoteContent("");
    setNoteError("");
  }

  function openEditNoteModal(doc: Document) {
    setNoteModal({ mode: "edit", doc });
    setNoteTitle(doc.filename);
    setNoteContent("");
    setNoteError("");
    fetch(`/api/documents/${doc.id}/preview`).then(async (res) => {
      if (res.ok) setNoteContent((await res.json()).content ?? "");
    });
  }

  function closeNoteModal() {
    setNoteModal(null);
    setNoteTitle("");
    setNoteContent("");
    setNoteError("");
  }

  async function saveNote() {
    if (!noteTitle.trim() || !noteContent.trim()) return;
    setSavingNote(true);
    setNoteError("");
    if (noteModal?.mode === "create") {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: noteTitle.trim(),
          content: noteContent.trim(),
          folder_id: currentFolderId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNoteError(data.error ?? "Lưu thất bại");
        setSavingNote(false);
        return;
      }
    } else if (noteModal?.doc) {
      const res = await fetch(`/api/documents/${noteModal.doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: noteTitle.trim(),
          note_content: noteContent.trim(),
        }),
      });
      if (!res.ok) {
        setNoteError((await res.json()).error ?? "Cập nhật thất bại");
        setSavingNote(false);
        return;
      }
    }
    setSavingNote(false);
    closeNoteModal();
    await refreshFolderView(currentFolderId);
  }

  async function openDocument(doc: Document) {
    setDocSelectionMode(false);
    setSelectedDocIds([]);
    setFolderSelectionMode(false);
    setSelectedFolderIds([]);
    selectionAnchorIdRef.current = null;
    setSelectedDoc(doc);
    setPreviewLoading(true);
    setPreview(null);
    const res = await fetch(`/api/documents/${doc.id}/preview`);
    if (res.ok) setPreview(await res.json());
    setPreviewLoading(false);
  }

  function closePreview() {
    setSelectedDoc(null);
    setPreview(null);
  }

  function hasUnsavedPreviewChanges() {
    if (!selectedDoc) return false
    const nameDirty = editName.trim() !== selectedDoc.filename
    const descDirty =
      (editDescription.trim() || '') !== (selectedDoc.description?.trim() || '')
    const savedTagIds = (selectedDoc.tags?.map((t) => t.id) ?? []).slice().sort().join(',')
    const currentTagIds = [...selectedTagIds].sort().join(',')
    const tagsDirty = savedTagIds !== currentTagIds
    const { canEditText, hasContentChanges } = getContentEditState(
      selectedDoc,
      preview,
      editContent
    )
    return nameDirty || descDirty || tagsDirty || (canEditText && hasContentChanges)
  }

  async function requestClosePreview() {
    if (!selectedDoc) return
    if (!hasUnsavedPreviewChanges()) {
      closePreview()
      return
    }

    const choice = await confirmChoice({
      title: 'Có thay đổi chưa lưu',
      description: 'Bạn có muốn lưu trước khi đóng không?',
      confirmLabel: 'Lưu',
      discardLabel: 'Không lưu',
      cancelLabel: 'Ở lại',
      variant: 'default',
    })

    if (choice === 'cancel') return

    if (choice === 'confirm') {
      const nameDirty = editName.trim() !== selectedDoc.filename
      const descDirty =
        (editDescription.trim() || '') !== (selectedDoc.description?.trim() || '')
      const savedTagIds = (selectedDoc.tags?.map((t) => t.id) ?? []).slice().sort().join(',')
      const currentTagIds = [...selectedTagIds].sort().join(',')
      const tagsDirty = savedTagIds !== currentTagIds
      const { canEditText, hasContentChanges } = getContentEditState(
        selectedDoc,
        preview,
        editContent
      )

      let ok = true
      if (nameDirty) ok = (await saveName()) && ok
      if (descDirty) ok = (await saveDescription()) && ok
      if (tagsDirty) ok = (await saveTags()) && ok
      if (canEditText && hasContentChanges) ok = (await saveContent()) && ok
      if (!ok) return
    }

    closePreview()
  }

  useEffect(() => {
    if (!selectedDoc) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') void requestClosePreview()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // Intentionally re-bind when draft fields change so Escape sees latest dirty state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDoc, editName, editDescription, editContent, selectedTagIds, preview])

  function handleDocDragStart(doc: Document, e: React.DragEvent) {
    const idsToDrag =
      selectedDocIds.length > 0 && selectedDocIds.includes(doc.id)
        ? selectedDocIds
        : [doc.id];
    beginLibraryDocDrag(idsToDrag, e.dataTransfer);
  }

  function handleDocDragEnd() {
    endLibraryDocDrag();
  }

  async function moveDocsToFolder(folderId: string | null, docIds: string[]) {
    if (docIds.length === 0) return
    setMovingDocs(true)
    setMoveError("")
    try {
      const results = await Promise.all(
        docIds.map(async (id) => {
          const res = await fetch(`/api/documents/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folder_id: folderId }),
          })
          return { id, ok: res.ok, error: await res.json().catch(() => null) }
        }),
      )
      const failed = results.filter((r) => !r.ok)
      if (failed.length > 0) {
        setMoveError(`Không thể di chuyển ${failed.length} tài liệu`)
        return
      }

      setSelectedDocIds([])
      closePreview()
      await refreshFolderView(currentFolderId)
    } finally {
      setMovingDocs(false)
    }
  }

  async function moveSelectedDocsFromDialog() {
    setMoveDialogOpen(false)
    await moveDocsToFolder(moveTargetFolderId, selectedDocIds)
  }

  async function bulkDeleteSelectedDocs() {
    if (selectedDocIds.length === 0) return
    setMoveError("")
    const ids = [...selectedDocIds]

    if (!trashMode) {
      const ok = await confirm({
        title: `Xóa ${ids.length} tài liệu?`,
        description: "Tài liệu sẽ được chuyển vào thùng rác.",
        confirmLabel: "Xóa vào thùng rác",
      })
      if (!ok) return

      await Promise.all(
        ids.map((id) =>
          fetch(`/api/documents/${id}`, { method: "DELETE" }).then((r) => r.ok),
        ),
      )
      setSelectedDocIds([])
      closePreview()
      await refreshFolderView(currentFolderId)
      return
    }

    // Trash mode: restore or permanently purge.
    const ok = await confirm({
      title: `Xóa vĩnh viễn ${ids.length} tài liệu?`,
      description: "Không thể khôi phục sau khi xóa.",
      confirmLabel: "Xóa vĩnh viễn",
    })
    if (!ok) return

    await Promise.all(
      ids.map((id) =>
        fetch(`/api/documents/${id}?permanent=1`, { method: "DELETE" }),
      ),
    )
    setSelectedDocIds([])
    closePreview()
    await fetchTrash()
  }

  async function bulkRestoreSelectedDocs() {
    if (selectedDocIds.length === 0) return
    const ids = [...selectedDocIds]
    const ok = await confirm({
      title: `Khôi phục ${ids.length} tài liệu?`,
      description: "Tài liệu sẽ được đưa về lại thư viện.",
      confirmLabel: "Khôi phục",
    })
    if (!ok) return

    await Promise.all(ids.map((id) => fetch(`/api/documents/${id}/restore`, { method: "POST" })))
    setSelectedDocIds([])
    closePreview()
    await fetchTrash()
  }


  async function saveName(): Promise<boolean> {
    if (!selectedDoc) return false;
    setPanelSaveError("");
    setSavingName(true);
    const res = await fetch(`/api/documents/${selectedDoc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: editName.trim() || selectedDoc.filename,
      }),
    });
    if (res.ok) {
      setSelectedDoc(await res.json());
      await refreshFolderView(currentFolderId);
      setSavingName(false);
      return true;
    }
    const data = await res.json().catch(() => ({}));
    setPanelSaveError(data.error ?? "Không thể lưu tên tài liệu");
    setSavingName(false);
    return false;
  }

  async function saveDescription(): Promise<boolean> {
    if (!selectedDoc) return false;
    setPanelSaveError("");
    setSavingDescription(true);
    const res = await fetch(`/api/documents/${selectedDoc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: editDescription.trim() || null,
      }),
    });
    if (res.ok) {
      setSelectedDoc(await res.json());
      await refreshFolderView(currentFolderId);
      setSavingDescription(false);
      return true;
    }
    const data = await res.json().catch(() => ({}));
    setPanelSaveError(data.error ?? "Không thể lưu mô tả");
    setSavingDescription(false);
    return false;
  }

  async function saveContent(): Promise<boolean> {
    if (!selectedDoc) return false;
    const content = editContent.trim();
    if (!content) {
      setPanelSaveError("Nội dung không được để trống");
      return false;
    }
    setPanelSaveError("");
    setSavingContent(true);
    const res = await fetch(`/api/documents/${selectedDoc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        selectedDoc.file_type === "note"
          ? { note_content: content }
          : { content },
      ),
    });
    if (res.ok) {
      const updated = await res.json();
      setSelectedDoc(updated);
      setPreview((prev) =>
        prev
          ? {
              ...prev,
              content,
            }
          : prev,
      );
      await refreshFolderView(currentFolderId);
      setSavingContent(false);
      return true;
    }
    const data = await res.json().catch(() => ({}));
    setPanelSaveError(data.error ?? "Không thể lưu nội dung đã chỉnh sửa");
    setSavingContent(false);
    return false;
  }

  async function saveTags(): Promise<boolean> {
    if (!selectedDoc) return false;
    setSavingTags(true);
    const res = await fetch(`/api/documents/${selectedDoc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag_ids: selectedTagIds }),
    });
    if (res.ok) {
      const updated = await res.json();
      setSelectedDoc(updated);
      await refreshFolderView(currentFolderId);
      setSavingTags(false);
      return true;
    }
    setSavingTags(false);
    return false;
  }

  async function reprocessOcr() {
    if (!selectedDoc) return;
    setReprocessingOcr(true);
    const res = await fetch(`/api/documents/${selectedDoc.id}/reprocess`, {
      method: "POST",
    });
    if (res.ok) {
      await refreshFolderView(currentFolderId);
      if (selectedDoc) {
        const previewRes = await fetch(
          `/api/documents/${selectedDoc.id}/preview`,
        );
        if (previewRes.ok) setPreview(await previewRes.json());
      }
    }
    setReprocessingOcr(false);
  }

  async function keepWeakOcrImage() {
    if (!selectedDoc) return;
    setKeepingWeakOcr(true);
    try {
      const res = await fetch(`/api/documents/${selectedDoc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismiss_ocr_warning: true }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSelectedDoc(updated);
        await refreshFolderView(currentFolderId);
      }
    } finally {
      setKeepingWeakOcr(false);
    }
  }

  async function handleDelete(documentId: string) {
    const ok = await confirm({
      title: "Xóa mục này?",
      description: "Mục sẽ được chuyển vào thùng rác.",
      confirmLabel: "Xóa",
    });
    if (!ok) return;
    markDeletingDoc(documentId);
    try {
      await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
      if (selectedDoc?.id === documentId) closePreview();
      await refreshFolderView(currentFolderId);
    } finally {
      unmarkDeletingDoc(documentId);
    }
  }

  async function handleAiSummary() {
    setSummaryOpen(true);
    setSummaryLoading(true);
    setSummaryError("");
    setSummaryText("");
    try {
      const res = await fetch("/api/documents/summarize", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSummaryError(data.error ?? td("aiFailed"));
        return;
      }
      setSummaryText(data.summary ?? "");
    } catch {
      setSummaryError(td("aiConnError"));
    } finally {
      setSummaryLoading(false);
    }
  }

  return (
    <div className="relative flex h-full">
      {confirmDialog}
      <Dialog
        open={summaryOpen}
        title={td("aiSummaryTitle")}
        onClose={() => !summaryLoading && setSummaryOpen(false)}
        maxWidth="max-w-lg"
        footer={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={summaryLoading}
            onClick={() => setSummaryOpen(false)}
          >
            {tc("close")}
          </Button>
        }
      >
        {summaryLoading && (
          <p className="text-sm text-muted-foreground">{td("aiAnalyzing")}</p>
        )}
        {summaryError && (
          <p className="text-sm text-destructive">{summaryError}</p>
        )}
        {!summaryLoading && !summaryError && summaryText && (
          <MarkdownContent content={summaryText} />
        )}
      </Dialog>
      <Dialog
        open={renamingFolder !== null}
        title={td("renameFolderTitle")}
        onClose={closeRenameFolder}
        footer={
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={savingFolderName}
              onClick={closeRenameFolder}
            >
              {tc("cancel")}
            </Button>
            <Button
              type="submit"
              form="rename-folder-form"
              size="sm"
              disabled={savingFolderName || !renameFolderName.trim()}
            >
              {savingFolderName ? td("renaming") : tc("save")}
            </Button>
          </>
        }
      >
        <form
          id="rename-folder-form"
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void renameFolder();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="rename-folder-name">{td("folderName")}</Label>
            <Input
              id="rename-folder-name"
              value={renameFolderName}
              onChange={(event) => setRenameFolderName(event.target.value)}
              maxLength={100}
              autoFocus
              disabled={savingFolderName}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rename-folder-description">{td("folderDescription")}</Label>
            <Textarea
              id="rename-folder-description"
              value={renameFolderDescription}
              onChange={(event) => setRenameFolderDescription(event.target.value)}
              maxLength={MAX_FOLDER_DESCRIPTION_LENGTH}
              rows={3}
              placeholder={td("folderDescriptionPlaceholder")}
              disabled={savingFolderName}
            />
          </div>
          {renameFolderError && (
            <p className="text-sm text-destructive">{renameFolderError}</p>
          )}
        </form>
      </Dialog>

      <Dialog
        open={editingFolderDescription !== null}
        title={td("folderDescription")}
        onClose={closeEditFolderDescription}
        footer={
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={savingFolderDescription}
              onClick={closeEditFolderDescription}
            >
              {tc("cancel")}
            </Button>
            <Button
              type="submit"
              form="edit-folder-description-form"
              size="sm"
              disabled={savingFolderDescription}
            >
              {savingFolderDescription ? td("renaming") : tc("save")}
            </Button>
          </>
        }
      >
        <form
          id="edit-folder-description-form"
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void saveFolderDescription();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="edit-folder-description">{td("folderDescription")}</Label>
            <Textarea
              id="edit-folder-description"
              value={folderDescriptionDraft}
              onChange={(event) => setFolderDescriptionDraft(event.target.value)}
              maxLength={MAX_FOLDER_DESCRIPTION_LENGTH}
              rows={4}
              placeholder={td("folderDescriptionPlaceholder")}
              disabled={savingFolderDescription}
            />
          </div>

          {folderDescriptionError && (
            <p className="text-sm text-destructive">{folderDescriptionError}</p>
          )}
        </form>
      </Dialog>

      <Dialog
        open={moveFolderDialogOpen}
        title={`Di chuyển ${selectedFolderIds.length} thư mục`}
        onClose={() => !movingFolders && setMoveFolderDialogOpen(false)}
        footer={
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={movingFolders}
              onClick={() => setMoveFolderDialogOpen(false)}
            >
              {tc("cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={movingFolders}
              onClick={() => {
                setMoveFolderDialogOpen(false)
                void moveFoldersToParent(moveFolderTargetId, selectedFolderIds)
              }}
            >
              {movingFolders ? "Đang di chuyển..." : tc("save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FolderPicker
            folders={allFolders.filter((f) => !selectedFolderIds.includes(f.id))}
            value={moveFolderTargetId}
            onChange={(folderId) => setMoveFolderTargetId(folderId)}
          />
          {moveFolderError && <p className="text-sm text-destructive">{moveFolderError}</p>}
        </div>
      </Dialog>

      <Dialog
        open={moveDialogOpen}
        title={`Di chuyển (${selectedDocIds.length})`}
        onClose={() => !movingDocs && setMoveDialogOpen(false)}
        footer={
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={movingDocs}
              onClick={() => setMoveDialogOpen(false)}
            >
              {tc("cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={movingDocs}
              onClick={() => void moveSelectedDocsFromDialog()}
            >
              {movingDocs ? "Đang di chuyển..." : tc("save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <FolderPicker
            folders={allFolders}
            value={moveTargetFolderId}
            onChange={(folderId) => setMoveTargetFolderId(folderId)}
          />
          {moveError && <p className="text-sm text-destructive">{moveError}</p>}
          <p className="text-xs text-muted-foreground">
            Thả tài liệu vào một thư mục cũng sẽ di chuyển chúng.
          </p>
        </div>
      </Dialog>

      {sidebarOpen && (
        <button
          type="button"
          aria-label="Đóng bộ lọc"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — drawer on mobile */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-[min(16rem,85vw)] border-r bg-background flex flex-col
          transition-transform duration-200 ease-out
          md:static md:z-auto md:w-52 md:shrink-0 md:translate-x-0 md:bg-muted/20
          ${sidebarOpen ? "translate-x-0 shadow-xl" : "-translate-x-full md:translate-x-0"}
        `}
      >
        <div className="border-b flex items-center justify-end p-2 md:hidden">
          <button
            type="button"
            className="h-7 w-7 rounded-md border border-input text-xs hover:bg-muted"
            onClick={() => setSidebarOpen(false)}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5 md:pt-2">
          {SIDEBAR_TYPES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTypeFilter(item.id);
                setTrashMode(false);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer ${
                typeFilter === item.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              {item.icon}
              <span className="flex-1 text-left">{td(item.labelKey)}</span>
              <span className="text-xs text-muted-foreground">
                {typeCounts[item.id] ?? 0}
              </span>
            </button>
          ))}
        </nav>
        <div className="p-2 border-t space-y-2">
          <div className="flex items-center justify-between px-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Tag
            </p>
            <button
              type="button"
              onClick={() => setShowTagManager(true)}
              className="text-xs text-primary hover:underline cursor-pointer"
            >
              Quản lý
            </button>
          </div>
          <div className="space-y-0.5 max-h-32 overflow-y-auto">
            <button
              type="button"
              onClick={() => {
                setTagFilter("all");
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                tagFilter === "all"
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted"
              }`}
            >
              <Tag className="h-3.5 w-3.5" />
              Tất cả tag
            </button>
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => {
                  setTagFilter(tag.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                  tagFilter === tag.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "hover:bg-muted"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="truncate">{tag.name}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="p-2 border-t">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-2 mb-2">
            Trạng thái
          </p>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="w-full text-xs rounded-md border border-input bg-background px-2 py-1.5"
          >
            <option value="all">Tất cả</option>
            <option value="done">Sẵn sàng</option>
            <option value="processing">Đang xử lý</option>
            <option value="pending">Chờ xử lý</option>
            <option value="failed">Lỗi</option>
          </select>
        </div>
        <div className="p-2 border-t">
          <button
            type="button"
            onClick={() => {
              setTrashMode((v) => !v);
              setTypeFilter("all");
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer ${
              trashMode
                ? "bg-destructive/10 text-destructive font-medium"
                : "text-foreground hover:bg-muted"
            }`}
          >
            <Trash2 className="h-4 w-4" />
            <span className="flex-1 text-left">{td("trash")}</span>
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 w-full">
        {/* Toolbar */}
        <div className="shrink-0 border-b bg-background px-3 sm:px-4 py-2.5 sm:py-3 flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            type="button"
            className="md:hidden h-9 w-9 shrink-0 rounded-md border border-input bg-background hover:bg-muted text-sm"
            onClick={() => setSidebarOpen(true)}
            aria-label={td("openFilters")}
          >
            ☰
          </button>
          {currentFolderId && (
            <Button
              size="sm"
              variant="ghost"
              className="h-9 px-2"
              onClick={() => {
                const parent =
                  breadcrumb.length > 2
                    ? breadcrumb[breadcrumb.length - 2].id
                    : null;
                navigateToFolder(parent);
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="relative flex-1 min-w-[140px] sm:min-w-[160px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={td("searchPlaceholder")}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="text-xs rounded-md border border-input bg-background px-2 py-1.5 h-9"
          >
            <option value="date">{td("sortNewest")}</option>
            <option value="name">{td("sortName")}</option>
          </select>
          <div className="flex rounded-md border border-input overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-2 cursor-pointer ${viewMode === "grid" ? "bg-muted" : "hover:bg-muted/50"}`}
              title={td("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-2 cursor-pointer ${viewMode === "list" ? "bg-muted" : "hover:bg-muted/50"}`}
              title={td("list")}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          <div
            className="hidden sm:flex -my-2.5 sm:-my-3 self-stretch items-stretch shrink-0 px-0.5"
            aria-hidden
          >
            <div className="w-px bg-border -skew-x-12" />
          </div>

          <div className="relative shrink-0" ref={addMenuRef}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shadow-sm border-primary/25 bg-background hover:bg-muted/40"
              onClick={() => setAddMenuOpen((v) => !v)}
              aria-expanded={addMenuOpen}
              aria-haspopup="menu"
            >
              <span
                className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-sky-300 via-violet-400 to-pink-400 text-white mr-1.5 shrink-0 shadow-sm"
                aria-hidden
              >
                <Plus className="h-3 w-3 stroke-[3]" />
              </span>
              {td("addNew")}
            </Button>
            {addMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 z-50 min-w-[11rem] rounded-lg border bg-popover py-1 shadow-lg"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted cursor-pointer text-left"
                  onClick={() => {
                    setAddMenuOpen(false);
                    setShowNewFolder(false);
                    setReuploadDoc(null);
                    setUploadDescription("");
                    setUploadTagIds([]);
                    setSelectedFile(null);
                    setUploadError("");
                    setShowUploadModal(true);
                  }}
                >
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  {td("uploadFile")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted cursor-pointer text-left"
                  onClick={() => {
                    setAddMenuOpen(false);
                    setShowUploadModal(false);
                    setShowNewFolder(true);
                  }}
                >
                  <FolderPlus className="h-4 w-4 text-muted-foreground" />
                  {td("newFolder")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted cursor-pointer text-left"
                  onClick={() => {
                    setAddMenuOpen(false);
                    setShowUploadModal(false);
                    setShowNewFolder(false);
                    openCreateNoteModal();
                  }}
                >
                  <StickyNote className="h-4 w-4 text-muted-foreground" />
                  {td("newNote")}
                </button>
              </div>
            )}
          </div>

          {selectedFolderIds.length > 0 ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground">
                {selectedFolderIds.length} thư mục
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9"
                disabled={movingFolders || deletingFolderIds.length > 0}
                onClick={() => {
                  setMoveFolderTargetId(null)
                  setMoveFolderDialogOpen(true)
                }}
              >
                <FolderPlus className="h-3.5 w-3.5 mr-1.5" />
                Di chuyển
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9"
                disabled={deletingFolderIds.length > 0}
                onClick={() => void bulkDeleteSelectedFolders()}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Xóa
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-9"
                onClick={() => {
                  setFolderSelectionMode(false);
                  setSelectedFolderIds([]);
                }}
              >
                Hủy
              </Button>
            </div>
          ) : selectedDocIds.length > 0 ? (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground">
                {selectedDocIds.length} đã chọn
              </span>

              {!trashMode ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9"
                    disabled={movingDocs}
                    onClick={() => {
                      setMoveTargetFolderId(currentFolderId);
                      setMoveDialogOpen(true);
                    }}
                  >
                    <FolderPlus className="h-3.5 w-3.5 mr-1.5" />
                    Di chuyển
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9"
                    disabled={movingDocs}
                    onClick={() => void bulkDeleteSelectedDocs()}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Xóa
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9"
                    disabled={movingDocs}
                    onClick={() => void bulkRestoreSelectedDocs()}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Khôi phục
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9"
                    disabled={movingDocs}
                    onClick={() => void bulkDeleteSelectedDocs()}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Xóa vĩnh viễn
                  </Button>
                </>
              )}
            </div>
          ) : null}

          <div className="ml-auto shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shadow-sm"
              onClick={() => void handleAiSummary()}
              disabled={summaryLoading}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5 text-amber-500" />
              {summaryLoading ? td("aiSummarizing") : td("aiSummary")}
            </Button>
          </div>
        </div>

        {showNewFolder && (
          <div className="shrink-0 border-b bg-muted/30 px-4 py-3 flex flex-col gap-2 max-w-md">
            <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[140px]">
              <Label className="text-xs">Tên thư mục mới</Label>
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Tên thư mục..."
                className="mt-1 h-9 text-sm"
                onKeyDown={(e) => e.key === "Enter" && createFolder()}
              />
            </div>
            <Button
              size="sm"
              onClick={createFolder}
              disabled={creatingFolder || !newFolderName.trim()}
            >
              {creatingFolder ? "Đang tạo..." : "Tạo"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowNewFolder(false)}
            >
              Đóng
            </Button>
            </div>
            <div>
              <Label className="text-xs">{td("folderDescription")}</Label>
              <Textarea
                value={newFolderDescription}
                onChange={(e) => setNewFolderDescription(e.target.value)}
                placeholder={td("folderDescriptionPlaceholder")}
                maxLength={MAX_FOLDER_DESCRIPTION_LENGTH}
                rows={2}
                className="mt-1 text-sm"
              />
            </div>
          </div>
        )}

        {/* File area + preview split */}
        <div
          className="flex-1 flex min-h-0 overflow-hidden relative"
          onPointerDown={(e) => {
            // Click on the empty background → deselect everything.
            const target = e.target as HTMLElement
            const isItem = target.closest('[data-selectable]')
            if (!isItem && (selectedDocIds.length > 0 || selectedFolderIds.length > 0 || docSelectionMode || folderSelectionMode)) {
              setSelectedDocIds([])
              setDocSelectionMode(false)
              setSelectedFolderIds([])
              setFolderSelectionMode(false)
              selectionAnchorIdRef.current = null
            }
          }}
        >
          <div className="flex-1 min-h-0 min-w-0 overflow-y-auto p-3 sm:p-4">
            {trashMode ? (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-medium flex items-center gap-2">
                    <Trash2 className="h-4 w-4 text-destructive" />
                    Thùng rác · {trashDocs.length} mục
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Tự xóa vĩnh viễn sau 30 ngày
                  </p>
                </div>
                {trashLoading ? (
                  <div
                    className="space-y-2"
                    aria-busy="true"
                    aria-label="Đang tải thùng rác"
                  >
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded-lg border border-border px-3 py-2"
                      >
                        <div className="h-8 w-8 shrink-0 rounded bg-muted animate-pulse" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-40 rounded bg-muted animate-pulse" />
                          <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : trashDocs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Trash2 className="h-12 w-12 mb-3 opacity-40" />
                    <p className="text-sm">Thùng rác trống</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {trashDocs.map((doc) => {
                      const isRestoring =
                        trashAction?.id === doc.id &&
                        trashAction.type === "restore";
                      const isPurging =
                        trashAction?.id === doc.id &&
                        trashAction.type === "purge";
                      const rowBusy = isRestoring || isPurging;
                      return (
                        <div
                          key={doc.id}
                          className={`relative flex items-center gap-3 rounded-lg border border-border px-3 py-2 ${
                            rowBusy ? "opacity-90" : ""
                          }`}
                        >
                          {rowBusy && (
                            <div
                              className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/85 backdrop-blur-[1px]"
                              aria-live="polite"
                            >
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <div
                                  className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin"
                                  aria-hidden
                                />
                                {isRestoring
                                  ? "Đang khôi phục..."
                                  : "Đang xóa vĩnh viễn..."}
                              </div>
                            </div>
                          )}
                          <DocumentThumb
                            doc={doc}
                            fallback={<FileIcon type={doc.file_type} size="sm" />}
                            className="h-10 w-10 shrink-0 rounded-md border bg-muted/40 object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm truncate">{doc.filename}</p>
                            <p className="text-xs text-muted-foreground">
                              Đã xóa{" "}
                              {doc.deleted_at
                                ? new Date(doc.deleted_at).toLocaleDateString(
                                    "vi-VN",
                                  )
                                : ""}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            disabled={rowBusy}
                            onClick={() => restoreDoc(doc.id)}
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                            Khôi phục
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-destructive hover:text-destructive"
                            disabled={rowBusy}
                            onClick={() => purgeDoc(doc.id)}
                          >
                            Xóa vĩnh viễn
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between gap-2 min-w-0">
                  {typeFilter === "favorite" ? (
                    <h2 className="text-sm font-medium flex items-center gap-1.5">
                      <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" />
                      {td("favorites")}
                    </h2>
                  ) : (
                    <FolderBreadcrumb
                      items={breadcrumb}
                      onNavigate={navigateToFolder}
                    />
                  )}
                </div>

                {loading ? (
                  <div
                    className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
                    aria-busy="true"
                    aria-label="Đang tải tài liệu"
                  >
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div
                        key={i}
                        className="rounded-xl border bg-card p-3 space-y-2"
                      >
                        <div className="h-10 w-10 mx-auto rounded-md bg-muted animate-pulse" />
                        <div className="h-3 w-full rounded bg-muted animate-pulse" />
                        <div className="h-3 w-2/3 mx-auto rounded bg-muted animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : (typeFilter === "favorite"
                  ? filteredDocs.length === 0
                  : visibleFolders.length === 0 && filteredDocs.length === 0) ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    {typeFilter === "favorite" ? (
                      <Star className="h-12 w-12 mb-3 opacity-40" />
                    ) : (
                      <FolderIcon className="h-12 w-12 mb-3 opacity-40" />
                    )}
                    <p className="text-sm">
                      {typeFilter === "favorite"
                        ? td("favoritesEmpty")
                        : "Thư mục trống"}
                    </p>
                    {typeFilter !== "favorite" && (
                      <p className="text-xs mt-1">
                        Tạo thư mục hoặc upload file mới
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    {typeFilter !== "favorite" &&
                      visibleFolders.length > 0 &&
                      (viewMode === "grid" ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-4">
                        {visibleFolders.map((folder) => (
                          <FolderGridItem
                            key={folder.id}
                            folder={folder}
                            onOpen={() => navigateToFolder(folder.id)}
                            onRename={() => openRenameFolder(folder)}
                            onEditDescription={() => openEditFolderDescription(folder)}
                            onDropDocs={(folderId, docIds) =>
                              void moveDocsToFolder(folderId, docIds)
                            }
                            onDropFolders={(targetId, folderIds) =>
                              void moveFoldersToParent(targetId, folderIds)
                            }
                            onDelete={() => deleteFolder(folder.id)}
                            busy={deletingFolderIds.includes(folder.id)}
                            selectionMode={folderSelectionMode}
                            selected={selectedFolderIds.includes(folder.id)}
                            onSelect={toggleFolderSelection}
                            selectedFolderIds={selectedFolderIds}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1 mb-4">
                        {visibleFolders.map((folder) => (
                          <FolderListItem
                            key={folder.id}
                            folder={folder}
                            onOpen={() => navigateToFolder(folder.id)}
                            onRename={() => openRenameFolder(folder)}
                            onDropDocs={(folderId, docIds) =>
                              void moveDocsToFolder(folderId, docIds)
                            }
                            onDropFolders={(targetId, folderIds) =>
                              void moveFoldersToParent(targetId, folderIds)
                            }
                            onDelete={() => deleteFolder(folder.id)}
                            busy={deletingFolderIds.includes(folder.id)}
                            selectionMode={folderSelectionMode}
                            selected={selectedFolderIds.includes(folder.id)}
                            onSelect={toggleFolderSelection}
                            selectedFolderIds={selectedFolderIds}
                          />
                        ))}
                      </div>
                    ))}

                    {filteredDocs.length === 0 ? (
                      typeFilter !== "favorite" && visibleFolders.length > 0 ? null : (
                        <p className="text-sm text-muted-foreground">
                          Không có tài liệu
                        </p>
                      )
                    ) : viewMode === "grid" ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                        {filteredDocs.map((doc) => (
                          <DriveGridItem
                            key={doc.id}
                            doc={doc}
                            selected={selectedDocIds.includes(doc.id)}
                            selectionMode={docSelectionMode}
                            onOpen={() => openDocument(doc)}
                            onSelect={toggleDocSelection}
                            onEdit={
                              doc.file_type === "note"
                                ? () => openEditNoteModal(doc)
                                : undefined
                            }
                            onDelete={() => handleDelete(doc.id)}
                            onToggleFavorite={() => void toggleFavorite(doc)}
                            onDragStart={(e) => handleDocDragStart(doc, e)}
                            onDragEnd={handleDocDragEnd}
                            fileIcon={<FileIcon type={doc.file_type} />}
                            busy={deletingDocIds.includes(doc.id)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {filteredDocs.map((doc) => (
                          <DriveListItem
                            key={doc.id}
                            doc={doc}
                            selected={selectedDocIds.includes(doc.id)}
                            selectionMode={docSelectionMode}
                            onOpen={() => openDocument(doc)}
                            onSelect={toggleDocSelection}
                            onEdit={
                              doc.file_type === "note"
                                ? () => openEditNoteModal(doc)
                                : undefined
                            }
                            onDelete={() => handleDelete(doc.id)}
                            onToggleFavorite={() => void toggleFavorite(doc)}
                            fileIcon={
                              <FileIcon type={doc.file_type} size="sm" />
                            }
                            formatBytes={formatBytes}
                            onDragStart={(e) => handleDocDragStart(doc, e)}
                            onDragEnd={handleDocDragEnd}
                            busy={deletingDocIds.includes(doc.id)}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* Document preview modal */}
          {selectedDoc && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/50"
              onClick={() => void requestClosePreview()}
              role="presentation"
            >
              <div
                className="w-full max-w-4xl lg:max-w-5xl h-[min(92vh,900px)] rounded-xl border bg-background shadow-xl overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={selectedDoc.filename}
              >
                <DocumentPreviewPanel
                  doc={selectedDoc}
                  preview={preview}
                  previewLoading={previewLoading}
                  editName={editName}
                  editDescription={editDescription}
                  editContent={editContent}
                  savingName={savingName}
                  savingDescription={savingDescription}
                  savingContent={savingContent}
                  saveError={panelSaveError}
                  typeLabels={TYPE_LABELS_LOCAL}
                  fileIcon={<FileIcon type={selectedDoc.file_type} />}
                  formatBytes={formatBytes}
                  allTags={tags}
                  selectedTagIds={selectedTagIds}
                  savingTags={savingTags}
                  onClose={() => void requestClosePreview()}
                  onEditName={setEditName}
                  onEditDescription={setEditDescription}
                  onEditContent={setEditContent}
                  onSaveName={saveName}
                  onSaveDescription={saveDescription}
                  onSaveContent={saveContent}
                  onTagIdsChange={setSelectedTagIds}
                  onSaveTags={saveTags}
                  onReprocessOcr={
                    isImageType(selectedDoc.file_type) ? reprocessOcr : undefined
                  }
                  reprocessingOcr={reprocessingOcr}
                  onKeepWeakOcr={
                    isImageType(selectedDoc.file_type) ? keepWeakOcrImage : undefined
                  }
                  keepingWeakOcr={keepingWeakOcr}
                  onReupload={
                    canReuploadDocument(selectedDoc)
                      ? () => openReupload(selectedDoc)
                      : undefined
                  }
                  reuploading={uploading && reuploadDoc?.id === selectedDoc.id}
                  onDelete={() => handleDelete(selectedDoc.id)}
                  deleting={deletingDocIds.includes(selectedDoc.id)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {noteModal && (
        <NoteModal
          mode={noteModal.mode}
          doc={noteModal.doc}
          title={noteTitle}
          content={noteContent}
          saving={savingNote}
          error={noteError}
          onTitleChange={setNoteTitle}
          onContentChange={setNoteContent}
          onSave={saveNote}
          onClose={closeNoteModal}
        />
      )}

      <UploadModal
        open={showUploadModal}
        reuploadDoc={reuploadDoc}
        selectedFile={selectedFile}
        description={uploadDescription}
        tagIds={uploadTagIds}
        allTags={tags}
        uploading={uploading}
        uploadProgress={uploadProgress}
        error={uploadError}
        onFileSelect={setSelectedFile}
        onDescriptionChange={setUploadDescription}
        onTagIdsChange={setUploadTagIds}
        onSubmit={handleUpload}
        onClose={closeUploadModal}
      />

      {showTagManager && (
        <TagManager
          tags={tags}
          onTagsChange={async () => {
            await fetchTags();
            await refreshFolderView(currentFolderId);
          }}
          onClose={() => setShowTagManager(false)}
        />
      )}
    </div>
  );
}
