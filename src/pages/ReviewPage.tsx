"use client";

import { useState, useEffect, useRef } from "react";
import { lovable } from "@/integrations/lovable";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  Plus, FolderOpen, Link2, Copy, Trash2, Upload, ChevronRight,
  MessageSquare, Users, FileText, Image as ImageIcon, Loader2,
  ArrowLeft, X, Check, HardDrive, CloudUpload, Eye, MoreVertical
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { PdfPagePicker } from "@/components/PdfPagePicker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type OutletContext = {
  isLoggedIn: boolean;
  setMobileOpen: (v: boolean) => void;
};

type Project = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
};

type ReviewLink = {
  id: string;
  project_id: string;
  reviewer_name: string;
  token: string;
  created_at: string;
};

type ReviewFile = {
  id: string;
  project_id: string;
  file_name: string;
  file_type: string;
  storage_path: string;
  source: string;
  page_count: number;
  sort_order: number;
  created_at: string;
};

type CommentCount = { project_id: string; count: number };

export default function ReviewPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setIsLoggedIn(!!data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setIsLoggedIn(!!session));
    return () => subscription.unsubscribe();
  }, []);

  const navigate = (path: string) => router.push(path);

  // List view
  const [projects, setProjects] = useState<Project[]>([]);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [loadingProjects, setLoadingProjects] = useState(true);

  // Selected project
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectLinks, setProjectLinks] = useState<ReviewLink[]>([]);
  const [projectFiles, setProjectFiles] = useState<ReviewFile[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Create project dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Add reviewer dialog
  const [showAddReviewer, setShowAddReviewer] = useState(false);
  const [reviewerName, setReviewerName] = useState("");
  const [addingReviewer, setAddingReviewer] = useState(false);

  // File upload
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfQueue, setPdfQueue] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Google Drive picker
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [driveUrl, setDriveUrl] = useState("");
  const [importingDrive, setImportingDrive] = useState(false);

  // Copy feedback
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  useEffect(() => {
    if (isLoggedIn) loadProjects();
  }, [isLoggedIn]);

  async function loadProjects() {
    setLoadingProjects(true);
    const { data, error } = await supabase
      .from("review_projects" as any)
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) { toast.error("Failed to load projects"); setLoadingProjects(false); return; }
    const projectsData = (data as unknown as Project[]) || [];
    setProjects(projectsData);

    // Load comment counts
    if (projectsData.length > 0) {
      const ids = projectsData.map((p) => p.id);
      const { data: counts } = await supabase
        .from("review_comments" as any)
        .select("project_id")
        .in("project_id", ids);
      if (counts) {
        const map: Record<string, number> = {};
        (counts as unknown as { project_id: string }[]).forEach((c) => {
          map[c.project_id] = (map[c.project_id] || 0) + 1;
        });
        setCommentCounts(map);
      }
    }
    setLoadingProjects(false);
  }

  async function loadProjectDetail(project: Project) {
    setSelectedProject(project);
    setLoadingDetail(true);
    const [{ data: links }, { data: files }] = await Promise.all([
      supabase.from("review_links" as any).select("*").eq("project_id", project.id).order("created_at"),
      supabase.from("review_files" as any).select("*").eq("project_id", project.id).order("sort_order"),
    ]);
    setProjectLinks((links as unknown as ReviewLink[]) || []);
    setProjectFiles((files as unknown as ReviewFile[]) || []);
    setLoadingDetail(false);
  }

  async function createProject() {
    if (!newTitle.trim()) return;
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Not authenticated"); setCreating(false); return; }
    const { data, error } = await supabase
      .from("review_projects" as any)
      .insert({ title: newTitle.trim(), description: newDesc.trim() || null, user_id: user.id })
      .select()
      .single();
    if (error) { toast.error("Failed to create project"); setCreating(false); return; }
    setShowCreateDialog(false);
    setNewTitle(""); setNewDesc("");
    setCreating(false);
    await loadProjects();
    loadProjectDetail(data as unknown as Project);
  }

  async function deleteProject(projectId: string) {
    const { error } = await supabase.from("review_projects" as any).delete().eq("id", projectId);
    if (error) { toast.error("Failed to delete project"); return; }
    toast.success("Project deleted");
    if (selectedProject?.id === projectId) setSelectedProject(null);
    await loadProjects();
  }

  async function addReviewer() {
    if (!reviewerName.trim() || !selectedProject) return;
    setAddingReviewer(true);
    const { data, error } = await supabase
      .from("review_links" as any)
      .insert({ project_id: selectedProject.id, reviewer_name: reviewerName.trim() })
      .select()
      .single();
    if (error) { toast.error("Failed to create reviewer link"); setAddingReviewer(false); return; }
    const newLink = data as unknown as ReviewLink;
    setProjectLinks((prev) => [...prev, newLink]);
    setReviewerName("");
    setShowAddReviewer(false);
    setAddingReviewer(false);
    toast.success(`Link created for ${newLink.reviewer_name}`);
  }

  async function deleteReviewer(linkId: string) {
    const { error } = await supabase.from("review_links" as any).delete().eq("id", linkId);
    if (error) { toast.error("Failed to delete reviewer"); return; }
    setProjectLinks((prev) => prev.filter((l) => l.id !== linkId));
    toast.success("Reviewer removed");
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/review/${selectedProject!.id}/${token}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

  // Upload file from device — handles multiple files
  async function handleFilesUpload(files: FileList | null) {
    if (!files || !selectedProject) return;
    const fileArr = Array.from(files);
    const images = fileArr.filter((f) => f.type !== "application/pdf");
    const pdfs = fileArr.filter((f) => f.type === "application/pdf");

    // Upload all images in batch
    if (images.length > 0) {
      setUploadProgress({ done: 0, total: images.length });
      for (let i = 0; i < images.length; i++) {
        await uploadImageFile(images[i], images[i].name, "image");
        setUploadProgress({ done: i + 1, total: images.length });
      }
      setUploadProgress(null);
    }

    // Queue PDFs for page-picking one by one
    if (pdfs.length > 0) {
      const [first, ...rest] = pdfs;
      setPdfQueue(rest);
      setPdfFile(first);
    }
  }

  async function uploadImageFile(file: File, fileName: string, fileType: string, dataUrl?: string) {
    setUploadingFile(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { toast.error("Not authenticated"); setUploadingFile(false); return; }

    const ext = fileName.split(".").pop() || "png";
    const storagePath = `${user.id}/review/${selectedProject!.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;

    let uploadData: Blob | File = file;
    if (dataUrl) {
      const res = await fetch(dataUrl);
      uploadData = await res.blob();
    }

    const { error: storageError } = await supabase.storage
      .from("review-files")
      .upload(storagePath, uploadData, { contentType: fileType === "image" ? "image/png" : file.type });
    if (storageError) { toast.error("Upload failed"); setUploadingFile(false); return; }

    const { data: fileRecord, error: fileError } = await supabase
      .from("review_files" as any)
      .insert({
        project_id: selectedProject!.id,
        user_id: user.id,
        file_name: fileName,
        file_type: fileType,
        storage_path: storagePath,
        source: "upload",
        page_count: 1,
        sort_order: projectFiles.length,
      })
      .select()
      .single();
    if (fileError) { toast.error("Failed to save file record"); setUploadingFile(false); return; }

    const newFile = fileRecord as unknown as ReviewFile;

    await supabase.from("review_pages" as any).insert({
      file_id: newFile.id,
      project_id: selectedProject!.id,
      page_number: 1,
      image_path: storagePath,
    });

    setProjectFiles((prev) => [...prev, newFile]);
    setUploadingFile(false);
  }

  async function handlePdfPageSelected(pageDataUrl: string, pageNumber: number) {
    if (!pdfFile || !selectedProject) return;
    const fileName = `${pdfFile.name} — Page ${pageNumber}`;
    const currentPdf = pdfFile;
    // Advance queue before upload so next PDF picker shows immediately after
    if (pdfQueue.length > 0) {
      const [next, ...rest] = pdfQueue;
      setPdfFile(next);
      setPdfQueue(rest);
    } else {
      setPdfFile(null);
    }
    await uploadImageFile(currentPdf, fileName, "image", pageDataUrl);
    toast.success(`${fileName} uploaded`);
  }

  async function deleteFile(fileId: string) {
    const { error } = await supabase.from("review_files" as any).delete().eq("id", fileId);
    if (error) { toast.error("Failed to delete file"); return; }
    setProjectFiles((prev) => prev.filter((f) => f.id !== fileId));
    toast.success("File removed");
  }

  // Google Drive import (URL-based)
  async function importFromDrive() {
    if (!driveUrl.trim() || !selectedProject) return;
    setImportingDrive(true);
    // Extract file ID from Google Drive URL
    const match = driveUrl.match(/\/d\/([-\w]+)/) || driveUrl.match(/id=([-\w]+)/);
    if (!match) { toast.error("Invalid Google Drive URL"); setImportingDrive(false); return; }
    const fileId = match[1];
    const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

    try {
      const res = await fetch(directUrl);
      if (!res.ok) throw new Error("Could not fetch file");
      const blob = await res.blob();
      const ext = blob.type.includes("pdf") ? "pdf" : "png";
      const file = new File([blob], `drive-import-${fileId}.${ext}`, { type: blob.type });
      setShowDrivePicker(false);
      setDriveUrl("");
      if (blob.type.includes("pdf")) {
        setPdfFile(file);
      } else {
        await uploadImageFile(file, file.name, "image");
      }
    } catch {
      toast.error("Failed to import from Google Drive. Make sure the file is publicly accessible.");
    }
    setImportingDrive(false);
  }

  async function getSignedUrl(path: string): Promise<string> {
    const { data } = await supabase.storage.from("review-files").createSignedUrl(path, 60 * 60);
    return data?.signedUrl || "";
  }

  // Signed URL cache for thumbnails
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    projectFiles.forEach(async (f) => {
      if (!thumbUrls[f.id]) {
        const url = await getSignedUrl(f.storage_path);
        setThumbUrls((prev) => ({ ...prev, [f.id]: url }));
      }
    });
  }, [projectFiles]);

  if (!isLoggedIn) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 min-h-screen">
        <div className="text-center space-y-4">
          <FolderOpen className="w-12 h-12 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Sign in to access Design Review</p>
          <Button onClick={() => lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/review` })}>
            Sign in with Google
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-5 py-4 flex items-center justify-between shrink-0 sticky top-0 z-30 bg-background">
        <div className="flex items-center gap-3">
          {selectedProject && (
            <button onClick={() => setSelectedProject(null)} className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h1 className="text-base font-display font-bold text-foreground leading-tight">
              {selectedProject ? selectedProject.title : "Design Review"}
            </h1>
            {!selectedProject && (
              <p className="text-xs text-muted-foreground">Share designs with clients & collect feedback</p>
            )}
          </div>
        </div>
        {!selectedProject && (
          <Button size="sm" onClick={() => setShowCreateDialog(true)} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New project
          </Button>
        )}
      </header>

      {/* Project List */}
      {!selectedProject && (
        <div className="flex-1 p-5">
          {loadingProjects ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : projects.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-24 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <FolderOpen className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-display font-bold text-foreground mb-2">No projects yet</h2>
              <p className="text-sm text-muted-foreground max-w-xs mb-6">
                Create a project, upload your designs, and share personalized review links with clients.
              </p>
              <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                <Plus className="w-4 h-4" /> Create first project
              </Button>
            </motion.div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
              {projects.map((project, i) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="group rounded-xl border border-border bg-card hover:border-primary/40 transition-all shadow-sm hover:shadow-md cursor-pointer"
                  onClick={() => loadProjectDetail(project)}
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FolderOpen className="w-4.5 h-4.5 text-primary" />
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <button className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-accent transition-all text-muted-foreground">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete project
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <h3 className="font-semibold text-sm text-foreground mb-1 line-clamp-1">{project.title}</h3>
                    {project.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{project.description}</p>
                    )}
                    <div className="flex items-center gap-3 pt-2 border-t border-border">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageSquare className="w-3 h-3" />
                        {commentCounts[project.id] || 0} comments
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Project Detail */}
      {selectedProject && (
        <div className="flex-1 flex flex-col lg:flex-row gap-0 min-h-0">
          {/* Files panel */}
          <div className="flex-1 p-5 border-r border-border min-h-0 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Pages & Files</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-8"
                  onClick={() => setShowDrivePicker(true)}
                >
                  <HardDrive className="w-3.5 h-3.5" /> Google Drive
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 text-xs h-8"
                  disabled={uploadingFile || !!uploadProgress}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {(uploadingFile || uploadProgress) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {uploadProgress ? `${uploadProgress.done}/${uploadProgress.total}` : "Upload"}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => { handleFilesUpload(e.target.files); e.target.value = ""; }}
                />
              </div>
            </div>

            {loadingDetail ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : pdfFile ? (
              <PdfPagePicker file={pdfFile} onSelect={handlePdfPageSelected} onCancel={() => setPdfFile(null)} />
            ) : projectFiles.length === 0 ? (
              <div
                className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/40 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <CloudUpload className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Drop images or PDFs here, or click to browse</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {projectFiles.map((file) => (
                  <div key={file.id} className="group relative rounded-lg overflow-hidden border border-border bg-muted aspect-[4/3]">
                    {thumbUrls[file.id] ? (
                      <img src={thumbUrls[file.id]} alt={file.file_name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all" />
                    <div className="absolute bottom-0 inset-x-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform">
                      <p className="text-white text-[11px] font-medium truncate">{file.file_name}</p>
                    </div>
                    <button
                      onClick={() => deleteFile(file.id)}
                      className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-full bg-destructive flex items-center justify-center"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
                {/* Add more */}
                <div
                  className="rounded-lg border-2 border-dashed border-border bg-muted/30 aspect-[4/3] flex items-center justify-center cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Plus className="w-5 h-5 text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          {/* Reviewers panel */}
          <div className="w-full lg:w-72 xl:w-80 p-5 flex flex-col gap-5 overflow-y-auto">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-muted-foreground" /> Reviewers
                </h2>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowAddReviewer(true)}>
                  <Plus className="w-3 h-3" /> Add
                </Button>
              </div>

              {projectLinks.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
                  No reviewers yet. Add a reviewer to generate a unique link.
                </p>
              ) : (
                <div className="space-y-2">
                  {projectLinks.map((link) => (
                    <div key={link.id} className="rounded-lg border border-border bg-card p-3 group">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-foreground">{link.reviewer_name}</span>
                        <button
                          onClick={() => deleteReviewer(link.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => copyLink(link.token)}
                          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                        >
                          {copiedToken === link.token ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          {copiedToken === link.token ? "Copied!" : "Copy link"}
                        </button>
                        <a
                          href={`/review/${selectedProject.id}/${link.token}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
                        >
                          <Eye className="w-3 h-3" /> Preview
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Comments summary */}
            <div>
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-muted-foreground" /> Feedback
              </h2>
              <CommentsSummary projectId={selectedProject.id} />
            </div>
          </div>
        </div>
      )}

      {/* Create project dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New review project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-sm mb-1.5 block">Project name</Label>
              <Input
                placeholder="e.g. Villa A — Living Room Concept"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createProject()}
                autoFocus
              />
            </div>
            <div>
              <Label className="text-sm mb-1.5 block">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                placeholder="Brief description of what you're reviewing…"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button className="flex-1" disabled={!newTitle.trim() || creating} onClick={createProject}>
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create project"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add reviewer dialog */}
      <Dialog open={showAddReviewer} onOpenChange={setShowAddReviewer}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add reviewer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-sm mb-1.5 block">Reviewer name</Label>
              <Input
                placeholder="e.g. Sarah (Client)"
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addReviewer()}
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1.5">A unique link will be generated for this person.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowAddReviewer(false)}>Cancel</Button>
              <Button className="flex-1" disabled={!reviewerName.trim() || addingReviewer} onClick={addReviewer}>
                {addingReviewer ? <Loader2 className="w-4 h-4 animate-spin" /> : "Generate link"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Google Drive import dialog */}
      <Dialog open={showDrivePicker} onOpenChange={setShowDrivePicker}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardDrive className="w-4 h-4" /> Import from Google Drive
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-sm mb-1.5 block">Google Drive share link</Label>
              <Input
                placeholder="https://drive.google.com/file/d/…"
                value={driveUrl}
                onChange={(e) => setDriveUrl(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                Make sure the file is set to <strong>"Anyone with the link can view"</strong> in Google Drive.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => { setShowDrivePicker(false); setDriveUrl(""); }}>Cancel</Button>
              <Button className="flex-1" disabled={!driveUrl.trim() || importingDrive} onClick={importFromDrive}>
                {importingDrive ? <Loader2 className="w-4 h-4 animate-spin" /> : "Import file"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Comments Summary sub-component ──────────────────────────────────────────
function CommentsSummary({ projectId }: { projectId: string }) {
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("review_comments" as any)
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(20);
      setComments((data as unknown as any[]) || []);
      setLoading(false);
    })();
  }, [projectId]);

  if (loading) return <div className="py-6 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>;
  if (comments.length === 0) return (
    <p className="text-xs text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
      No comments yet. Share links to start collecting feedback.
    </p>
  );

  return (
    <div className="space-y-2">
      {comments.map((c) => (
        <div key={c.id} className="rounded-lg border border-border bg-card p-3 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground">{c.reviewer_name}</span>
            <span className="text-[10px] text-muted-foreground">
              {c.review_pages?.page_number ? `Page ${c.review_pages.page_number}` : ""}
            </span>
          </div>
          {c.comment_text && <p className="text-xs text-muted-foreground line-clamp-2">{c.comment_text}</p>}
          {c.voice_path && (
            <span className="inline-flex items-center gap-1 text-[10px] text-primary">
              🎤 Voice note
            </span>
          )}
          {c.annotation_rect && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              ⬜ Region annotation
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
