import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, ChevronRight, CircleAlert, ClipboardList, CloudUpload, FileImage, FileText, FolderOpen, ImagePlus, Info, Pencil, Plus, Search, ShieldCheck, Sparkles, Trash2, Upload, X, Download, RotateCcw, GripVertical } from 'lucide-react';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import NotFound from '@/pages/not-found';
import { allowedFile, eventsFromNewsletterRows, eventsFromText, readLocalFile } from './extract';
import { buildNewsletterPdf } from './newsletter-pdf';
import type { Category, EventRecord, ReportInfo, SourceDiagnostics, SourceFile } from './studio-types';
import { moveEventToCategory, possiblySameEvent } from './studio-utils';
import './studio.css';

const defaultCategories: Category[] = [
  { id: 'workshops', name: 'Workshops', keywords: [{ term: 'workshop', weight: 5 }, { term: 'training', weight: 3 }, { term: 'skill enhancement', weight: 3 }, { term: 'hands-on', weight: 2 }] },
  { id: 'talks', name: 'Technical Talks', keywords: [{ term: 'technical talk', weight: 5 }, { term: 'technical session', weight: 4 }, { term: 'seminar', weight: 4 }, { term: 'guest lecture', weight: 4 }] },
  { id: 'codathons', name: 'Codeathons', keywords: [{ term: 'codeathon', weight: 5 }, { term: 'codathon', weight: 5 }, { term: 'coding contest', weight: 4 }] },
  { id: 'hackathons', name: 'Hackathons', keywords: [{ term: 'hackathon', weight: 5 }, { term: 'ideathon', weight: 4 }, { term: 'buildathon', weight: 4 }] },
  { id: 'alumni', name: 'Alumni Interactions', keywords: [{ term: 'alumni interaction', weight: 5 }, { term: 'alumni talk', weight: 4 }] },
  { id: 'clubs', name: 'Club Activities', keywords: [{ term: 'club activity', weight: 5 }, { term: 'club activities', weight: 5 }, { term: 'student club', weight: 3 }] },
  { id: 'outreach', name: 'Outreach Activities', keywords: [{ term: 'outreach', weight: 5 }, { term: 'awareness campaign', weight: 4 }, { term: 'school visit', weight: 3 }] },
  { id: 'department', name: 'Department Activities', keywords: [{ term: 'department activity', weight: 4 }, { term: 'industrial visit', weight: 4 }, { term: 'student conclave', weight: 3 }, { term: 'FDP', weight: 3 }] },
  { id: 'students', name: 'Student Achievements', keywords: [{ term: 'student achievement', weight: 5 }, { term: 'winner', weight: 3 }, { term: 'secured first place', weight: 4 }, { term: 'selected for', weight: 2 }] },
  { id: 'faculty', name: 'Faculty Achievements', keywords: [{ term: 'faculty achievement', weight: 5 }, { term: 'published', weight: 3 }, { term: 'patent filed', weight: 4 }, { term: 'paper presenter', weight: 3 }] },
  { id: 'placements', name: 'Placemental Success', keywords: [{ term: 'placement', weight: 5 }, { term: 'placed', weight: 5 }, { term: 'salary package', weight: 3 }] },
  { id: 'other', name: 'Other', keywords: [] },
];
const defaultReport: ReportInfo = {
  institution: 'Vidyavardhaka College of Engineering, Mysuru',
  department: 'Department of CSE (Artificial Intelligence & Machine Learning)',
  title: 'AIML-Gazette',
  volume: '4',
  issue: '1',
  academicYear: '2025–26',
  period: '',
  subtitle: 'Department Newsletter',
  coverLead: 'Leading the Way in Engineering Education',
  logo: '',
  departmentLogo: '',
  coverImage: '',
  tagline: 'CREATING A CULTURE OF INNOVATION',
  collegeProfile: '',
  departmentTagline: 'The Science of Machines That Learn and Evolve',
  vision: '',
  mission: '',
  hodMessage: '',
  hodName: '',
  hodRole: '',
  editorialTeam: '',
};
type Page = 'upload' | 'review' | 'report' | 'complete';
type Modal = 'edit' | 'add' | 'delete' | 'new-project' | 'duplicate' | null;
const uid = () => crypto.randomUUID();
const fmtSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const countPhrase = (count: number, singular: string, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;
const diagnosticsSummary = (d: SourceDiagnostics) => [
  `${countPhrase(d.importedRecords, 'record')} added`,
  `${countPhrase(d.extractedPhotos, 'photo')} extracted`,
  `${countPhrase(d.associatedPhotos, 'photo')} matched`,
  `${countPhrase(d.recordsNeedingReview, 'record')} ${d.recordsNeedingReview === 1 ? 'needs' : 'need'} review`,
  d.duplicateCandidates ? `${countPhrase(d.duplicateCandidates, 'duplicate candidate')} pending` : '',
  d.unassignedPhotos ? `${countPhrase(d.unassignedPhotos, 'photo')} ${d.unassignedPhotos === 1 ? 'needs' : 'need'} assignment` : '',
  d.unsupportedImages ? `${countPhrase(d.unsupportedImages, 'unsupported image')}` : '',
  d.failedImages ? `${countPhrase(d.failedImages, 'image extraction')} failed` : '',
].filter(Boolean).join(' · ');
const safeText = (x: string) => x || 'Not provided';
const filenamePart = (value: string) => value.trim().replace(/[–—]/g, '-').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
const pdfFilename = (report: ReportInfo) => [
  filenamePart(report.title) || 'newsletter',
  report.volume && filenamePart(`Volume-${report.volume}`),
  report.issue && filenamePart(`Issue-${report.issue}`),
  report.academicYear && filenamePart(`AY-${report.academicYear}`),
].filter(Boolean).join('_') + '.pdf';
const missingEventFields = (event: EventRecord) => [
  !event.name.trim() && 'title',
  !event.date.trim() && 'date',
  event.classificationSource !== 'Newsletter data form' && !event.venue.trim() && 'venue',
  !event.description.trim() && 'description',
].filter(Boolean) as string[];
const eventNeedsReview = (event: EventRecord) => event.needsReview || missingEventFields(event).length > 0;
type DuplicateCandidate = { candidate: EventRecord; match: EventRecord };

function App() {
  const [page, setPage] = useState<Page>('upload');
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>(defaultCategories);
  const [reviewThreshold] = useState(0.62);
  const [report, setReport] = useState<ReportInfo>(defaultReport);
  const [dragging, setDragging] = useState(false);
  const [dragOverCategory, setDragOverCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState<Modal>(null);
  const [activeEvent, setActiveEvent] = useState<EventRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [duplicateQueue, setDuplicateQueue] = useState<DuplicateCandidate[]>([]);
  const [photoTargetByFile, setPhotoTargetByFile] = useState<Record<string, string>>({});
  const [toast, setToast] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [downloaded, setDownloaded] = useState(false);
  const eventsRef = useRef<EventRecord[]>([]);
  const analysisRun = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const generationVersion = useRef(0);

  useEffect(() => {
    document.cookie = 'sidebar_state=; path=/; max-age=0';
  }, []);
  useEffect(() => {
    if (!pdfUrl) return;
    return () => URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);
  useEffect(() => {
    setPdfUrl('');
    setDownloaded(false);
    if (page === 'complete') setPage('report');
  }, [events, report, categories]);
  useEffect(() => {
    eventsRef.current = events;
    generationVersion.current += 1;
  }, [events]);
  useEffect(() => { generationVersion.current += 1; }, [report, categories]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  }, []);
  const needsReview = events.filter(eventNeedsReview);
  const filteredEvents = useMemo(() => events.filter(e => {
    const query = search.toLowerCase();
    const categoryName = categories.find(category => category.id === e.category)?.name || '';
     const matchesText = !query || [e.name, e.description, e.date, e.venue, e.organizer, e.department, e.club, categoryName, e.sourceFile, e.sourceEventType || '', e.sourceEventName || '', e.sourceDescription || ''].some(x => x.toLowerCase().includes(query));
    const matchesFilter = filter === 'all' || (filter === 'review' ? eventNeedsReview(e) : e.category === filter);
    return matchesText && matchesFilter;
  }), [events, search, filter]);

  const analyzeFile = async (sf: SourceFile, runId: number) => {
    setFiles(old => old.map(f => f.id === sf.id ? { ...f, status: 'working', message: 'Reading locally…' } : f));
    try {
      const result = await readLocalFile(sf.file);
      if (runId !== analysisRun.current) return;
      const tableRecognized = Boolean(result.newsletterTableRecognized || result.newsletterRows !== undefined);
      let parsed: EventRecord[] = [];
      let importWarning = result.warning || '';
      let unmatchedPhotos = [...(result.unassociatedPhotos || [])];
      if (result.text || tableRecognized || result.photos?.length || result.pages?.length || result.unassociatedPhotos?.length) {
        let nextOrder = eventsRef.current.length;
        parsed = tableRecognized
          ? eventsFromNewsletterRows(result.newsletterRows || [], sf.file.name, categories, nextOrder)
          : result.pages?.length
          ? result.pages.flatMap(page => {
              const pageEvents = eventsFromText(page.text, sf.file.name, categories, nextOrder, reviewThreshold);
              nextOrder += pageEvents.length;
              if (page.image && pageEvents.length === 1) {
                pageEvents[0].images = [...pageEvents[0].images, page.image];
              } else if (page.image) {
                unmatchedPhotos.push(page.image);
              }
              return pageEvents;
            })
          : eventsFromText(result.text, sf.file.name, categories, eventsRef.current.length, reviewThreshold);
        if (!tableRecognized && !result.pages?.length && result.photos?.length && parsed.length === 1) {
          parsed = parsed.map(event => ({ ...event, images: [...event.images, ...result.photos!] }));
        } else if (!tableRecognized && !result.pages?.length && result.photos?.length && parsed.length !== 1) {
          unmatchedPhotos.push(...result.photos);
        }
        parsed = parsed.map(event => ({ ...event, sourceId: sf.id }));
        const additions: EventRecord[] = [];
        const duplicates: DuplicateCandidate[] = [];
        if (parsed.length) {
          for (const candidate of parsed) {
            const match = [...eventsRef.current, ...additions].find(event => possiblySameEvent(event, candidate));
            if (match) duplicates.push({ candidate, match });
            else additions.push(candidate);
          }
          if (additions.length) {
            const next=[...eventsRef.current,...additions.map((event,index)=>({...event,order:eventsRef.current.length+index}))];
            eventsRef.current=next;
            setEvents(next);
          }
          if (duplicates.length) { setDuplicateQueue(old => [...old, ...duplicates]); setModal('duplicate'); }
        }
        const extractedPhotos = tableRecognized
          ? parsed.reduce((total, event) => total + event.images.length, 0) + unmatchedPhotos.length
          : result.photos?.length || result.pages?.reduce((total, page) => total + Number(Boolean(page.image)), 0) || 0;
        const associatedPhotos = parsed.reduce((total, event) => total + event.images.length, 0);
        const diagnostics: SourceDiagnostics = {
          importedRecords: additions.length,
          extractedPhotos,
          associatedPhotos,
          recordsNeedingReview: parsed.filter(eventNeedsReview).length,
          duplicateCandidates: duplicates.length,
          unassignedPhotos: unmatchedPhotos.length,
          unsupportedImages: result.unsupportedImages || 0,
          failedImages: result.failedImages || 0,
        };
        if (!parsed.length) importWarning = [importWarning, 'No clear event record was detected. No event facts were added.'].filter(Boolean).join(' ');
        if (unmatchedPhotos.length) importWarning = [importWarning, `${countPhrase(unmatchedPhotos.length, 'extracted photo')} ${unmatchedPhotos.length === 1 ? 'needs' : 'need'} manual event assignment.`].filter(Boolean).join(' ');
        const status = importWarning || duplicates.length || !parsed.length ? 'warning' : 'done';
        setFiles(old => old.map(f => f.id === sf.id
          ? { ...f, status, message: importWarning || '', diagnostics, unmatchedPhotos }
          : f));
        if (unmatchedPhotos.length && (eventsRef.current[0] || additions[0])) {
          setPhotoTargetByFile(old => ({ ...old, [sf.id]: old[sf.id] || eventsRef.current[0]?.id || additions[0]?.id || '' }));
        }
        if (!parsed.length) notify('No event candidates found. No facts were added.');
        else if (importWarning) notify('Import completed with items that need attention.');
        else if (tableRecognized) notify(`${additions.length} newsletter records added. Review the imported rows, categories and images.`);
        else notify('Local analysis complete. Check every extracted detail.');
      } else {
        setFiles(old => old.map(f => f.id === sf.id
          ? { ...f, status: 'warning', message: [importWarning, 'No readable text or recognized newsletter table was found.'].filter(Boolean).join(' ') }
          : f));
        notify(result.warning || 'No text could be extracted.');
      }
    } catch {
      if (runId !== analysisRun.current) return;
      setFiles(old => old.map(f => f.id === sf.id ? { ...f, status: 'error', message: 'Could not read this file. It may be damaged or unsupported.' } : f));
      notify('This file could not be processed.');
    }
  };
  const addFiles = async (selected: FileList | File[]) => {
    if (busy) return;
    const incoming = Array.from(selected);
    if (!incoming.length) return;
    const acceptedFiles: SourceFile[] = [];
    incoming.forEach(file => {
      if (!file.size) { notify(`${file.name} is empty.`); return; }
      if (file.size > 30 * 1024 * 1024) { notify(`${file.name} is larger than the 30 MB per-file limit.`); return; }
      if (!allowedFile(file)) { notify(`${file.name} is not a supported format.`); return; }
      if ([...files, ...acceptedFiles].some(f => f.file.name === file.name && f.file.size === file.size)) { notify(`${file.name} is already in this session.`); return; }
      acceptedFiles.push({ id: uid(), file, status: 'ready' });
    });
    if (!acceptedFiles.length) return;
    setFiles(old => [...old, ...acceptedFiles]);
  };
  const analyzeReadyFiles = async () => {
    const readyFiles = files.filter(file => file.status === 'ready');
    if (!readyFiles.length) {
      if (events.length) setPage('review');
      else notify('Choose a supported document or image first.');
      return;
    }
    setBusy(true);
    const runId = analysisRun.current;
    try {
      for (const source of readyFiles) {
        if (runId !== analysisRun.current) break;
        await analyzeFile(source, runId);
      }
    } finally {
      if (runId === analysisRun.current) setBusy(false);
    }
  };
  const removeFile = (id: string) => {
    setFiles(old => old.filter(f => f.id !== id));
    setPhotoTargetByFile(old => { const next = { ...old }; delete next[id]; return next; });
    notify('Source file removed. Events already imported from it remain in your session.');
  };
  const attachUnmatchedPhotos = (fileId: string) => {
    const source = files.find(file => file.id === fileId);
    const selectedTarget = photoTargetByFile[fileId];
    const targetId = events.some(event => event.id === selectedTarget) ? selectedTarget : events[0]?.id;
    if (!source?.unmatchedPhotos?.length || !targetId) {
      notify('Add an event and choose it before attaching these photos.');
      return;
    }
    const photos = source.unmatchedPhotos;
    setEvents(old => old.map(event => event.id === targetId ? { ...event, images: [...event.images, ...photos] } : event));
    setFiles(old => old.map(file => file.id === fileId
      ? {
          ...file,
          unmatchedPhotos: [],
          diagnostics: file.diagnostics ? {
            ...file.diagnostics,
            associatedPhotos: file.diagnostics.associatedPhotos + photos.length,
            unassignedPhotos: 0,
          } : undefined,
          message: file.message?.replace(/\s*\d+ extracted photos? needs? manual event assignment\./i, ''),
          status: file.diagnostics?.unsupportedImages || file.diagnostics?.failedImages ? 'warning' : 'done',
        }
      : file));
    notify(`${photos.length} photo${photos.length === 1 ? '' : 's'} attached to the selected event.`);
  };
  const startNewProject = () => {
    analysisRun.current += 1;
    eventsRef.current=[];
     setFiles([]); setEvents([]); setCategories(defaultCategories); setReport(defaultReport); setPdfUrl(''); setDownloaded(false); setSearch(''); setFilter('all'); setDuplicateQueue([]); setPhotoTargetByFile({}); setActiveEvent(null); setPendingDelete(null); setPage('upload'); setModal(null); setBusy(false); setDragging(false); setDragOverCategory('');
    notify('Session workspace cleared.');
  };
  const requestNewProject = () => {
    if (files.length || events.length || pdfUrl || report !== defaultReport) setModal('new-project');
    else startNewProject();
  };
  const saveEvent = (event: EventRecord) => {
    setEvents(old => old.some(e => e.id === event.id)
      ? old.map(e => e.id === event.id ? event : e)
      : [...old, { ...event, order: old.length }]);
    setModal(null); setActiveEvent(null); notify('Event saved to this session.');
  };
  const openEdit = (event: EventRecord) => { setActiveEvent(event); setModal('edit'); };
  const addBlankEvent = () => {
    const e: EventRecord = { id: uid(), name: '', description: '', date: '', time: '', venue: '', organizer: '', department: '', club: '', participants: '', teamSize: '', category: categories[0]?.id || '', images: [], confidence: 1, score: 0, classificationSource: 'Manually added', needsReview: true, sourceFile: 'Added manually', order: events.length };
    setActiveEvent(e); setModal('add');
  };
  const deleteEvent = () => {
    if (pendingDelete) setEvents(old => old.filter(e => e.id !== pendingDelete));
    setPendingDelete(null); setModal(null); notify('Event removed.');
  };
  const resolveDuplicate = (keepBoth:boolean) => {
    const [current,...remaining] = duplicateQueue;
    if (current) {
      if (keepBoth) setEvents(old => [...old,{...current.candidate,order:old.length}]);
      setFiles(old => old.map(file => file.id === current.candidate.sourceId && file.diagnostics
        ? { ...file, diagnostics: {
            ...file.diagnostics,
            importedRecords: file.diagnostics.importedRecords + Number(keepBoth),
            duplicateCandidates: Math.max(0, file.diagnostics.duplicateCandidates - 1),
          } }
        : file));
    }
    setDuplicateQueue(remaining);
    if (!remaining.length) setModal(null);
  };
  const imageToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(); reader.readAsDataURL(file);
  });
  const imageToCoverDataUrl = async (file: File) => {
    const source = await imageToDataUrl(file);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Unable to read cover photo'));
      element.src = source;
    });
    const width = 1600, height = 600, targetRatio = width / height;
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    const cropWidth = sourceRatio > targetRatio ? image.naturalHeight * targetRatio : image.naturalWidth;
    const cropHeight = sourceRatio > targetRatio ? image.naturalHeight : image.naturalWidth / targetRatio;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    context.drawImage(image, (image.naturalWidth - cropWidth) / 2, (image.naturalHeight - cropHeight) / 2, cropWidth, cropHeight, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', 0.88);
  };
  const addEventImages = async (list: FileList | null) => {
    if (!list) return [];
    const imgs = Array.from(list).filter(f => /^image\/(jpeg|png)$/.test(f.type));
    return Promise.all(imgs.map(imageToDataUrl));
  };
  const moveEvent = (eventId: string, categoryId: string, beforeId?: string) => {
    setEvents(old => moveEventToCategory(old, eventId, categoryId, beforeId));
  };
  const generatePdf = async () => {
    if (!events.length) { notify('Add or extract an event before generating a report.'); return; }
    const version = generationVersion.current;
    try {
      const snapshot = { report: structuredClone(report), events: structuredClone(events), categories: structuredClone(categories) };
      const blob = await buildNewsletterPdf(snapshot.report, snapshot.events, snapshot.categories);
      if (version !== generationVersion.current) {
        notify('The register changed during PDF generation. Generate again for the latest version.');
        return;
      }
      setPdfUrl(URL.createObjectURL(blob));
      setPage('report');
      notify('Newsletter PDF preview is ready.');
    } catch (error) {
      notify(error instanceof Error && error.message.startsWith('Unable to add the ')
        ? error.message
        : 'PDF generation failed. Check the photos and publication details, then try again.');
    }
  };
  const downloadPdf = () => {
    if (!pdfUrl) { notify('Generate the latest preview before downloading.'); return; }
    const link = document.createElement('a');
    link.href = pdfUrl;
    link.download = pdfFilename(report);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setDownloaded(true);
    setPage('complete');
  };

  const steps: { id: Page; title: string }[] = [
    { id: 'upload', title: 'Upload' },
    { id: 'review', title: 'Review categories' },
    { id: 'report', title: 'Preview' },
    { id: 'complete', title: 'Download' },
  ];
  const pageNames: Record<Page,string> = {
    upload: 'Upload', review: 'Review categories', report: 'Preview', complete: 'Download',
  };
  const activeStep = page === 'complete' ? 3 : page === 'report' ? 2 : page === 'upload' ? 0 : 1;

  return <div className="studio">
    <main className="main-area">
      <header className="topbar"><div className="topbar-identity"><div className="brand-mark"><BookOpen size={17}/></div><div className="crumb"><span>Newsletter studio</span><ChevronRight size={13}/><b>{pageNames[page]}</b></div></div><div style={{display:'flex',alignItems:'center',gap:10}}><button className="btn small" onClick={requestNewProject} data-testid="button-new-project-global"><RotateCcw size={13}/> Start over</button><span className="session-pill"><i/> Browser only</span></div></header>
      <nav className="workflow-nav" aria-label="Newsletter workflow">
        <ol className="workflow-steps">{steps.map((step, index) => {
          const accessible = index === 0 || index <= activeStep || (index === 1 && events.length > 0);
          return <li key={step.id} className={index === activeStep ? 'current' : index < activeStep ? 'completed' : ''}>
            <button type="button" onClick={() => setPage(step.id)} disabled={!accessible || (step.id === 'complete' && !downloaded)} aria-current={index === activeStep ? 'step' : undefined}>
              <span className="workflow-number">{index < activeStep ? <Check size={13}/> : index + 1}</span><span>{step.title}</span>
            </button>
          </li>;
        })}</ol>
      </nav>
      {page==='upload' && <section className="page">
        <div className="page-head"><div><div className="eyebrow">Step 01 / Upload</div><h1>Organize your event newsletter.</h1><p className="lede">Choose a DOCX, PDF, or image. The document is read on this device; check the extracted details before creating your newsletter.</p></div><div className="head-actions">{events.length>0&&<button className="btn" onClick={()=>setPage('review')}>Review {events.length} event{events.length===1?'':'s'} <ChevronRight size={15}/></button>}</div></div>
        <div className="upload-grid">
          <div>
            <div className={`dropzone ${dragging?'dragging':''}`} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void addFiles(e.dataTransfer.files)}} data-testid="dropzone-files">
              <div className="drop-icon"><CloudUpload size={23}/></div><h3>Drop your event file here</h3><p>DOCX, PDF, JPG, or PNG · up to 30 MB per file · processed in this browser</p>
              <button className="btn primary" onClick={()=>fileRef.current?.click()} disabled={busy} data-testid="button-choose-files"><Plus size={15}/> Choose files</button>
              <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.jpg,.jpeg,.png" hidden onChange={e=>{if(e.target.files) void addFiles(e.target.files);e.target.value=''}} data-testid="input-files"/>
            </div>
            {files.length>0 && <div className="section-head"><h3>Selected files <span>({files.length})</span></h3><span>Files are only read after you start analysis.</span></div>}
            {(files.some(file=>file.status==='ready')||busy)&&<div className="analysis-actions">
              <button className="btn primary" onClick={()=>void analyzeReadyFiles()} disabled={busy} data-testid="button-analyze-organize"><Sparkles size={15}/>{busy?'Analyzing locally…':'Analyze and Organize'}</button>
              {busy&&<span role="status">Reading selected files in this browser. Keep this tab open until analysis finishes.</span>}
            </div>}
            <div className="file-list">{files.map(f=><div className="file-entry" key={f.id} data-testid={`file-row-${f.id}`}>
              <div className="file-row">
                {f.file.type.startsWith('image/')?<FileImage size={17} className="file-icon"/>:<FileText size={17} className="file-icon"/>}
                <div className="file-main"><div className="file-name">{f.file.name}</div><div className="file-meta">{f.file.type || f.file.name.split('.').pop()?.toUpperCase()} · {fmtSize(f.file.size)}{f.diagnostics ? '' : ` · ${f.message || (f.status==='working'?'Reading in browser…':'Ready to analyze')}`}</div>
                  {f.diagnostics&&<div className="file-diagnostics" aria-label="Import diagnostics">{diagnosticsSummary(f.diagnostics)}</div>}
                  {f.message&&<div className="file-warning">{f.message}</div>}
                </div>
                <span className={`state-tag ${f.status==='warning'?'warn':f.status==='error'?'error':''}`}>{f.status==='working'?'Reading':f.status==='done'?'Analyzed':f.status==='error'?'Problem':f.status==='warning'?'Review':'Ready'}</span>
                <button className="btn icon small" aria-label={`Remove source file ${f.file.name}; imported events remain`} onClick={()=>removeFile(f.id)} disabled={busy||f.status==='working'} data-testid={`button-remove-file-${f.id}`}><X size={14}/></button>
              </div>
              {!!f.unmatchedPhotos?.length&&<div className="unmatched-photos" data-testid={`unmatched-photos-${f.id}`}>
                <div><strong>{f.unmatchedPhotos.length} photo{f.unmatchedPhotos.length===1?'':'s'} need an event assignment.</strong><span>Nothing has been attached automatically because the source did not identify a matching record.</span></div>
                <div className="unmatched-photo-controls">
                  {events.length
                    ? <><label className="sr-only" htmlFor={`photo-target-${f.id}`}>Choose the event for these photos</label><select id={`photo-target-${f.id}`} value={events.some(event=>event.id===photoTargetByFile[f.id])?photoTargetByFile[f.id]:events[0]?.id||''} onChange={e=>setPhotoTargetByFile(old=>({...old,[f.id]:e.target.value}))} aria-label="Choose event for unmatched photos">
                        <option value="" disabled>Select an event</option>
                        {events.map(event=><option key={event.id} value={event.id}>{event.name||'Untitled event'} · {categories.find(category=>category.id===event.category)?.name||'Uncategorized'}</option>)}
                      </select><button className="btn small" disabled={!events.length} onClick={()=>attachUnmatchedPhotos(f.id)}>Attach to event</button></>
                    : <button className="btn small" onClick={()=>{setPage('review');addBlankEvent()}}>Add an event first</button>}
                </div>
                <div className="unmatched-photo-thumbs">{f.unmatchedPhotos.map((image,index)=><img src={image} alt={`Unassigned source photo ${index+1}`} key={`${f.id}-unmatched-${index}`}/>)}</div>
              </div>}
            </div>)}</div>
          </div>
          <aside className="panel side-guide"><div className="eyebrow">A careful first pass</div><h3>From scattered materials to a reviewable register.</h3>
            <div className="guide-line"><b>1</b><span><strong>Read locally</strong><br/>Documents are never uploaded. OCR is attempted for image files.</span></div>
            <div className="guide-line"><b>2</b><span><strong>Suggest, never assume</strong><br/>Only wording found in source files is used. Missing facts stay blank.</span></div>
            <div className="guide-line"><b>3</b><span><strong>You make it final</strong><br/>Check uncertain details, arrange events, then prepare the PDF.</span></div>
            <div className="callout"><ShieldCheck size={15}/><span>Everything in this workspace is held in memory for this browser session only.</span></div>
          </aside>
        </div>
        {(busy || files.some(f=>f.status==='error'||f.status==='warning')) && <div className="section-head"><h3>Processing notes</h3></div>}
        {files.filter(f=>f.status==='error'||f.status==='warning').map(f=><div className="alert" key={f.id}><CircleAlert size={16}/><span><strong>{f.file.name}:</strong> {f.message}</span><button className="btn small" disabled={busy} onClick={()=>{const sf=files.find(x=>x.id===f.id);if(sf){const runId=analysisRun.current;setBusy(true);void analyzeFile(sf,runId).finally(()=>{if(runId===analysisRun.current)setBusy(false)})}}}>Retry</button></div>)}
        {events.length>0&&<div className="analysis-result" role="status"><Check size={16}/><span>{events.length} event{events.length===1?'':'s'} in your register · {needsReview.length} need review</span><button className="btn small" onClick={()=>setPage('review')}>Review categories <ChevronRight size={14}/></button></div>}
      </section>}

      {page==='review' && <section className="page">
        <div className="page-head"><div><div className="eyebrow">Step 02 / Review categories</div><h1>Check and arrange your events.</h1><p className="lede">Review the suggested categories, correct details, and move cards between groups. Choose a category from each card if you’re on a touch device.</p></div><div className="head-actions"><button className="btn" onClick={()=>setPage('upload')}><Plus size={15}/> Add another file</button><button className="btn primary" onClick={()=>void generatePdf()} disabled={!events.length}>Continue to Preview <ChevronRight size={15}/></button></div></div>
        {events.length===0 ? <div className="panel panel-pad" style={{textAlign:'center',padding:'60px 18px'}}><FolderOpen size={28} color="#74867a"/><h2 style={{marginTop:12}}>Your register is ready for source material</h2><p className="lede" style={{margin:'10px auto 18px'}}>Upload documents first, or add an event manually. No sample records have been included.</p><button className="btn primary" onClick={()=>setPage('upload')}>Go to upload</button> <button className="btn" onClick={addBlankEvent}><Plus size={14}/> Add event manually</button></div> :
        <>
          <div className="toolbar">
            <div className="searchbox"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search events, venues, source files…" aria-label="Search events" data-testid="input-search-events"/></div>
            <select className="select-control" value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filter events" data-testid="select-filter"><option value="all">All events ({events.length})</option><option value="review">Needs review ({needsReview.length})</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name} ({events.filter(e=>e.category===c.id).length})</option>)}</select>
             <span className="review-total">{events.length} events · {needsReview.length} need review</span>
          </div>
          {needsReview.length>0 && <div className="callout" style={{marginBottom:14}}><Info size={15}/><span><strong>{needsReview.length} records need a second look.</strong> Some have uncertain classifications or are missing a title, date, venue, or description. Drag cards between columns to reclassify.</span></div>}
           <div className="category-board">{categories.map(cat=><div className={`category-column ${dragOverCategory===cat.id?'over':''}`} key={cat.id} onDragEnter={()=>setDragOverCategory(cat.id)} onDragOver={e=>{e.preventDefault();setDragOverCategory(cat.id)}} onDragLeave={e=>{if(e.currentTarget===e.target)setDragOverCategory('')}} onDrop={e=>{e.preventDefault();setDragOverCategory('');const dragged=e.dataTransfer.getData('text/event-id');if(dragged)moveEvent(dragged,cat.id)}} data-testid={`category-column-${cat.id}`}>
            <div className="cat-head"><div className="cat-title"><GripVertical size={13} color="#98a097"/>{cat.name}</div><span className="cat-count">{events.filter(e=>e.category===cat.id).length}</span></div>
            {filteredEvents.filter(e=>e.category===cat.id).sort((a,b)=>a.order-b.order).map((event,index)=><article className="event-card" key={event.id} draggable aria-label={`${event.name||'Untitled event'}. Drag to move between categories, or use the category selector.`} onDragStart={e=>e.dataTransfer.setData('text/event-id',event.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.stopPropagation();const draggingId=e.dataTransfer.getData('text/event-id');if(draggingId)moveEvent(draggingId,cat.id,event.id)}} data-testid={`event-card-${event.id}`}>
              {event.images.length ? <div className="event-card-photo-strip">{event.images.slice(0,3).map((image,imageIndex)=><img key={`${event.id}-photo-${imageIndex}`} src={image} alt={`${event.name || 'Event'} photo ${imageIndex + 1}`}/>)}</div> : <div className="event-card-no-photo"><FileImage size={15}/> No event photograph available</div>}
              <h3>{event.name||'Untitled event'}</h3><p>{event.description||'No description in source material.'}</p>
              <div className="event-meta"><span>{event.date||'Date not found'}</span><span title={`Classification confidence: ${Math.round(event.confidence*100)}%`} className={`confidence ${event.confidence<reviewThreshold?'low':''}`}>{Math.round(event.confidence*100)}% {event.confidence>=.8?'high':event.confidence>=.55?'medium':'low'}</span></div>
              <div className="classification-source">Classification: {event.classificationSource}</div>
              <div className="classification-source">Source: {event.sourceFile}{event.sourceEventType?` · ${event.sourceEventType}`:''}</div>
              {eventNeedsReview(event)&&<div className="review-banner"><CircleAlert size={11}/> Needs review · {event.classificationSource}{missingEventFields(event).length>0&&<span className="event-incomplete">Missing {missingEventFields(event).join(', ')}</span>}</div>}
               <div className="event-actions"><label className="sr-only" htmlFor={`category-${event.id}`}>Category for {event.name||'untitled event'}</label><select id={`category-${event.id}`} className="event-category-select" value={event.category} onChange={e=>moveEvent(event.id,e.target.value)} aria-label={`Change category for ${event.name||'untitled event'}`}><option value="" disabled>Select category</option>{categories.map(category=><option value={category.id} key={category.id}>{category.name}</option>)}</select><button className="btn" onClick={()=>openEdit(event)} aria-label={`Edit ${event.name}`} data-testid={`button-edit-${event.id}`}><Pencil size={13}/> Edit</button><button className="btn danger" onClick={()=>{setPendingDelete(event.id);setModal('delete')}} aria-label={`Delete ${event.name}`} data-testid={`button-delete-${event.id}`}><Trash2 size={13}/></button></div>
            </article>)}
            {filteredEvents.filter(e=>e.category===cat.id).length===0&&<div className="empty-column">{events.some(e=>e.category===cat.id)?'No matching events. Adjust search or filter.':'Drop an event here to classify it.'}</div>}
          </div>)}</div>
          {filteredEvents.length===0&&<div className="panel panel-pad" style={{textAlign:'center',marginTop:14,color:'#718075'}}>No events match this search.</div>}
        </>}
      </section>}

      {page==='report' && <section className="page">
        <div className="page-head"><div><div className="eyebrow">Step 03 / Preview</div><h1>Preview your newsletter.</h1><p className="lede">This PDF reflects the events and categories you reviewed. Go back to make changes, then generate a fresh preview.</p></div><div className="head-actions"><button className="btn" onClick={()=>setPage('review')}><ClipboardList size={15}/> Back to categories</button><button className="btn primary" onClick={()=>void generatePdf()} disabled={!events.length} data-testid="button-generate-pdf"><RotateCcw size={14}/> Refresh preview</button></div></div>
        <div className="preview-layout">
          <div className="panel panel-pad publication-details">
            <div className="section-head" style={{margin:'0 0 16px'}}><h3>Newsletter details</h3><span>Optional</span></div>
            <div className="field-grid">
              <div className="field full"><label htmlFor="report-title">Newsletter title</label><input id="report-title" value={report.title} onChange={e=>setReport({...report,title:e.target.value})} placeholder="Event newsletter"/></div>
              <div className="field"><label htmlFor="institution">Institution</label><input id="institution" value={report.institution} onChange={e=>setReport({...report,institution:e.target.value})} placeholder="Institution name"/></div>
              <div className="field"><label htmlFor="department">Department</label><input id="department" value={report.department} onChange={e=>setReport({...report,department:e.target.value})} placeholder="Department name"/></div>
              <div className="field"><label htmlFor="year">Academic year</label><input id="year" value={report.academicYear} onChange={e=>setReport({...report,academicYear:e.target.value})} placeholder="e.g. 2025–26"/></div>
              <div className="field"><label htmlFor="period">Reporting period</label><input id="period" value={report.period} onChange={e=>setReport({...report,period:e.target.value})} placeholder="Optional"/></div>
            </div>
            {needsReview.length>0&&<div className="callout" style={{marginTop:15}}><CircleAlert size={15}/><span>{needsReview.length} event{needsReview.length===1?'':'s'} still need review. They will be included with the current details.</span></div>}
          </div>
          <div className="preview-wrap">
            <div className="preview-toolbar"><div><strong>PDF preview</strong><div className="preview-status">{pdfUrl?'Generated from the latest reviewed details':'Generate the preview to see your newsletter'}</div></div></div>
            {pdfUrl?<iframe className="pdf-frame" src={pdfUrl} title="Generated newsletter PDF preview" data-testid="frame-pdf-preview"/>:<div className="no-preview"><BookOpen size={27}/><strong>Your newsletter preview will appear here.</strong><span>Return to category review and choose “Continue to Preview”.</span></div>}
            <div className="download-panel"><div><strong>Download Your Newsletter</strong><span>{pdfUrl?pdfFilename(report):'Generate a preview before downloading.'}</span></div><button className="btn primary" onClick={downloadPdf} disabled={!pdfUrl} data-testid="button-download-pdf"><Download size={15}/> Download PDF</button></div>
          </div>
        </div>
      </section>}
      {page==='complete' && <section className="page completion-page">
        <div className="completion-card panel">
          <div className="completion-icon"><Check size={25}/></div>
          <div className="eyebrow">Step 04 / Download</div>
          <h1>Your PDF download has started.</h1>
          <p className="lede">If your browser did not save it, download it again below. Your project is still in this browser session until you start a new file or leave.</p>
          <div className="completion-actions"><button className="btn primary" onClick={downloadPdf} disabled={!pdfUrl}><Download size={15}/> Download PDF again</button><button className="btn" onClick={requestNewProject}><RotateCcw size={15}/> Start New File</button></div>
          <button className="text-button" onClick={()=>setPage('review')}>Return to category review</button>
        </div>
      </section>}
    </main>

    {(modal==='edit'||modal==='add')&&activeEvent&&<EventModal event={activeEvent} categories={categories} onClose={()=>{setModal(null);setActiveEvent(null)}} onSave={saveEvent} onImages={addEventImages} title={modal==='add'?'Add an event':'Review event details'} />}
    {modal==='delete'&&<ConfirmModal title="Remove this event?" detail="This event will be removed from the current session register. The source file remains available." cancel={()=>setModal(null)} confirm={deleteEvent} confirmText="Remove event"/>}
    {modal==='new-project'&&<ConfirmModal title="Start a new project?" detail="The current files, event edits, report details and preview will be cleared from memory. This action cannot be undone." cancel={()=>setModal(null)} confirm={startNewProject} confirmText="Clear workspace"/>}
    {modal==='duplicate'&&duplicateQueue[0]&&<div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="duplicate-title"><div className="modal-head"><div><div className="eyebrow">Possible duplicate · {duplicateQueue.length} remaining</div><h2 id="duplicate-title">This event may already be here.</h2><p>Review both records. The match is based on event-name and detail similarity.</p></div><button className="btn icon" onClick={()=>resolveDuplicate(false)} aria-label="Skip candidate"><X size={16}/></button></div><div className="duplicate-box"><strong>Existing event</strong><div>{duplicateQueue[0].match.name}</div><small>{duplicateQueue[0].match.date||'No date recorded'} · {duplicateQueue[0].match.sourceFile}</small></div><div className="duplicate-box"><strong>New source wording</strong><div>{duplicateQueue[0].candidate.name}</div><small>{duplicateQueue[0].candidate.date||'No date recorded'} · {duplicateQueue[0].candidate.sourceFile}</small></div><div className="modal-footer"><button className="btn" onClick={()=>resolveDuplicate(false)}>Discard candidate</button><div><button className="btn primary" onClick={()=>{resolveDuplicate(true);notify('Candidate added for review.')}}>Keep both events</button></div></div></div></div>}
    {toast&&<div className="toast-note" role="status">{toast}</div>}
  </div>;
}

function EventModal({event,categories,onClose,onSave,onImages,title}:{event:EventRecord;categories:Category[];onClose:()=>void;onSave:(event:EventRecord)=>void;onImages:(list:FileList|null)=>Promise<string[]>;title:string}) {
  const [draft,setDraft]=useState<EventRecord>({...event});
  const [replaceImages,setReplaceImages]=useState(false);
  const imgRef=useRef<HTMLInputElement>(null);
  const change=(key:keyof EventRecord,value:string)=>setDraft(old=>({...old,[key]:value}));
  const markDone=()=>setDraft(old=>({...old,needsReview:false,confidence:Math.max(old.confidence,.75)}));
  return <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="event-modal-title">
    <div className="modal-head"><div><div className="eyebrow">{draft.sourceFile}</div><h2 id="event-modal-title">{title}</h2><p>Keep source-grounded details, and leave unknowns blank.</p></div><button className="btn icon" onClick={onClose} aria-label="Close"><X size={16}/></button></div>
    {(draft.needsReview||missingEventFields(draft).length>0)&&<div className="alert"><CircleAlert size={15}/><span>This record needs review. The source match is {Math.round(draft.confidence*100)}%{missingEventFields(draft).length>0?`. Missing: ${missingEventFields(draft).join(', ')}.`:' and some details may need checking.'}</span></div>}
    {(draft.sourceEventType||draft.sourceEventName||draft.sourceDescription)&&<details className="source-details">
      <summary>Original wording from the data-format row</summary>
      {draft.sourceMonth&&<p><strong>Source month:</strong> {draft.sourceMonth}</p>}
      {draft.sourceEventType&&<p><strong>Source event type:</strong> {draft.sourceEventType}</p>}
      {draft.sourceEventName&&<p><strong>Source event name:</strong> {draft.sourceEventName}</p>}
      {draft.sourceDescription&&<p><strong>Original description:</strong> {draft.sourceDescription}</p>}
    </details>}
    <div className="field-grid">
      <div className="field full"><label htmlFor="ev-name">Event name</label><input id="ev-name" value={draft.name} onChange={e=>change('name',e.target.value)} placeholder="Title as stated in source"/></div>
      <div className="field full"><label htmlFor="ev-description">Description / source excerpt</label><textarea id="ev-description" value={draft.description} onChange={e=>change('description',e.target.value)} placeholder="No description detected"/></div>
      <div className="field"><label htmlFor="ev-date">Date</label><input id="ev-date" value={draft.date} onChange={e=>change('date',e.target.value)} placeholder="Not found in source"/></div>
      <div className="field"><label htmlFor="ev-time">Time</label><input id="ev-time" value={draft.time} onChange={e=>change('time',e.target.value)} placeholder="Not found in source"/></div>
      <div className="field"><label htmlFor="ev-venue">Venue</label><input id="ev-venue" value={draft.venue} onChange={e=>change('venue',e.target.value)} placeholder="Not found in source"/></div>
      <div className="field"><label htmlFor="ev-organizer">Organizer</label><input id="ev-organizer" value={draft.organizer} onChange={e=>change('organizer',e.target.value)} placeholder="Not found in source"/></div>
      <div className="field"><label htmlFor="ev-department">Department</label><input id="ev-department" value={draft.department} onChange={e=>change('department',e.target.value)} placeholder="Not found in source"/></div>
      <div className="field"><label htmlFor="ev-club">Club / society</label><input id="ev-club" value={draft.club} onChange={e=>change('club',e.target.value)} placeholder="Not found in source"/></div>
      <div className="field"><label htmlFor="ev-participants">Participants</label><input id="ev-participants" value={draft.participants} onChange={e=>change('participants',e.target.value)} placeholder="Not found in source"/></div>
      <div className="field"><label htmlFor="ev-team">Team size</label><input id="ev-team" value={draft.teamSize} onChange={e=>change('teamSize',e.target.value)} placeholder="Not found in source"/></div>
      <div className="field"><label htmlFor="ev-category">Category</label><select id="ev-category" value={draft.category} onChange={e=>{setDraft(old=>({...old,category:e.target.value,classificationSource:'Manually assigned',needsReview:false,confidence:1}))}}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
    </div>
    <div className="section-head"><h3>Event photos</h3><div style={{display:'flex',gap:7}}>{draft.images.length>0&&<button className="btn small" onClick={()=>{setReplaceImages(true);imgRef.current?.click()}}>Replace all</button>}<button className="btn small" onClick={()=>{setReplaceImages(false);imgRef.current?.click()}}><ImagePlus size={13}/>Add photos</button></div><input ref={imgRef} type="file" accept="image/png,image/jpeg" multiple hidden onChange={async e=>{const list=e.target.files;const added=await onImages(list);setDraft(old=>({...old,images:replaceImages?added:[...old.images,...added]}));setReplaceImages(false);e.target.value=''}}/></div>
    {draft.images.length>0&&<div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{draft.images.map((img,i)=><div key={`${i}-${img.slice(0,30)}`} style={{position:'relative'}}><img src={img} alt={`Event image ${i+1}`} style={{width:74,height:66,objectFit:'cover',borderRadius:5,border:'1px solid #ddd'}}/><button className="btn icon small danger" aria-label={`Remove image ${i+1}`} onClick={()=>setDraft(old=>({...old,images:old.images.filter((_,j)=>j!==i)}))} style={{position:'absolute',right:2,top:2,background:'#fffefa',padding:3}}><X size={11}/></button></div>)}</div>}
    <div className="modal-footer"><button className="btn" onClick={onClose}>Cancel</button><div>{draft.needsReview&&<button className="btn" onClick={markDone}><Check size={14}/> Mark reviewed</button>}<button className="btn primary" onClick={()=>onSave({...draft,needsReview:draft.needsReview&& !draft.name})} data-testid="button-save-event"><Check size={14}/> Save event</button></div></div>
  </div></div>;
}

function ConfirmModal({title,detail,cancel,confirm,confirmText}:{title:string;detail:string;cancel:()=>void;confirm:()=>void;confirmText:string}) {
  return <div className="modal-backdrop" role="presentation"><div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" style={{maxWidth:430}}><div className="modal-head"><div><div className="eyebrow">Please confirm</div><h2 id="confirm-title">{title}</h2><p>{detail}</p></div><button className="btn icon" onClick={cancel} aria-label="Close"><X size={16}/></button></div><div className="modal-footer"><button className="btn" onClick={cancel}>Keep working</button><div><button className="btn danger" onClick={confirm}>{confirmText}</button></div></div></div></div>;
}

function Router() { return <Switch><Route path="/" component={App}/><Route component={NotFound}/></Switch>; }
function Root() { return <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/,'')}><Router/></WouterRouter>; }
export default Root;
