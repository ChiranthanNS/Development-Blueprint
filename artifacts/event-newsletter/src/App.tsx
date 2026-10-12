import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, BookOpen, Check, ChevronRight, CircleAlert, ClipboardList, CloudUpload, FileImage, FileText, FolderOpen, ImagePlus, Info, LockKeyhole, Pencil, Plus, Search, Settings2, ShieldCheck, Sparkles, Trash2, Upload, X, Download, Eye, RotateCcw, GripVertical, ChartNoAxesColumnIncreasing, ListFilter, CircleHelp } from 'lucide-react';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import NotFound from '@/pages/not-found';
import { allowedFile, eventsFromNewsletterRows, eventsFromText, readLocalFile } from './extract';
import { buildNewsletterPdf } from './newsletter-pdf';
import type { Category, EventRecord, ReportInfo, SourceFile } from './studio-types';
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
type Page = 'upload' | 'review' | 'dashboard' | 'report' | 'settings';
type Modal = 'edit' | 'add' | 'delete' | 'clear' | 'new-project' | 'duplicate' | 'category-delete' | null;
const uid = () => crypto.randomUUID();
const fmtSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const safeText = (x: string) => x || 'Not provided';
const filenamePart = (value: string) => value.trim().replace(/[–—]/g, '-').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
const pdfFilename = (report: ReportInfo) => [
  filenamePart(report.title) || 'newsletter',
  report.volume && filenamePart(`Volume-${report.volume}`),
  report.issue && filenamePart(`Issue-${report.issue}`),
  report.academicYear && filenamePart(`AY-${report.academicYear}`),
].filter(Boolean).join('_') + '.pdf';
const chartColors = ['#31564a', '#b8975b', '#708b77', '#b87355', '#647c98', '#8d718f', '#c29b58', '#a5a89a'];
const piePath = (cx: number, cy: number, radius: number, start: number, end: number) => {
  const x1 = cx + radius * Math.cos(start), y1 = cy + radius * Math.sin(start);
  const x2 = cx + radius * Math.cos(end), y2 = cy + radius * Math.sin(end);
  return `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${end - start > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
};
const tokenSimilarity = (first: string, second: string) => {
  const words = (text: string) => new Set(text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').match(/[\p{L}\p{N}]{3,}/gu) || []);
  const a = words(first), b = words(second);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter(word => b.has(word)).length;
  return intersection / (a.size + b.size - intersection);
};
const possiblySameEvent = (first: EventRecord, second: EventRecord) => {
  const nameScore = tokenSimilarity(first.name, second.name);
  const descriptionScore = tokenSimilarity(first.description, second.description);
  const sameDate = Boolean(first.date && second.date && first.date.toLowerCase().trim() === second.date.toLowerCase().trim());
  return (nameScore >= 0.8 && (!first.date || !second.date || sameDate || descriptionScore >= 0.62)) ||
    (sameDate && descriptionScore >= 0.5);
};
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
  const [reviewThreshold, setReviewThreshold] = useState(0.62);
  const [report, setReport] = useState<ReportInfo>(defaultReport);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState<Modal>(null);
  const [activeEvent, setActiveEvent] = useState<EventRecord | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [duplicateQueue, setDuplicateQueue] = useState<DuplicateCandidate[]>([]);
  const [toast, setToast] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [logoName, setLogoName] = useState('');
  const [departmentLogoName, setDepartmentLogoName] = useState('');
  const [coverImageName, setCoverImageName] = useState('');
  const eventsRef = useRef<EventRecord[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const departmentLogoRef = useRef<HTMLInputElement>(null);
  const coverImageRef = useRef<HTMLInputElement>(null);
  const importImagesRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pdfUrl) return;
    return () => URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);
  useEffect(() => {
    if (!pdfUrl) return;
    URL.revokeObjectURL(pdfUrl);
    setPdfUrl('');
  }, [events, report, categories]);
  useEffect(() => { eventsRef.current = events; }, [events]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  }, []);
  const counts = useMemo(() => categories.map(c => ({ ...c, count: events.filter(e => e.category === c.id).length })), [categories, events]);
  const needsReview = events.filter(eventNeedsReview);
  const filteredEvents = useMemo(() => events.filter(e => {
    const query = search.toLowerCase();
    const categoryName = categories.find(category => category.id === e.category)?.name || '';
     const matchesText = !query || [e.name, e.description, e.date, e.venue, e.organizer, e.department, e.club, categoryName, e.sourceFile, e.sourceEventType || '', e.sourceEventName || '', e.sourceDescription || ''].some(x => x.toLowerCase().includes(query));
    const matchesFilter = filter === 'all' || (filter === 'review' ? eventNeedsReview(e) : e.category === filter);
    return matchesText && matchesFilter;
  }), [events, search, filter]);

  const analyzeFile = async (sf: SourceFile) => {
    setFiles(old => old.map(f => f.id === sf.id ? { ...f, status: 'working', message: 'Reading locally…' } : f));
    try {
      const result = await readLocalFile(sf.file);
      let importedCount = 0;
      let parsed: EventRecord[] = [];
      let importWarning = result.warning || '';
      if (result.text || result.newsletterRows?.length) {
        let nextOrder = eventsRef.current.length;
        parsed = result.newsletterRows?.length
          ? eventsFromNewsletterRows(result.newsletterRows, sf.file.name, categories, nextOrder)
          : result.pages?.length
          ? result.pages.flatMap(page => {
              const pageEvents = eventsFromText(page.text, sf.file.name, categories, nextOrder, reviewThreshold);
              nextOrder += pageEvents.length;
              return pageEvents.map(event => ({ ...event, images: page.image ? [page.image] : [] }));
            })
          : eventsFromText(result.text, sf.file.name, categories, eventsRef.current.length, reviewThreshold);
        importedCount = parsed.length;
        if (!result.newsletterRows?.length && result.photos?.length && parsed.length === 1) {
          parsed = parsed.map(event => ({ ...event, images: [...event.images, ...result.photos!] }));
        } else if (!result.newsletterRows?.length && result.photos?.length && parsed.length > 1) {
          importWarning = [importWarning, `${result.photos.length} embedded photo${result.photos.length === 1 ? '' : 's'} could not be matched to individual records, so they were left unattached.`].filter(Boolean).join(' ');
        }
        if (parsed.length) {
          const additions: EventRecord[] = [];
          const duplicates: DuplicateCandidate[] = [];
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
        } else {
          setFiles(old => old.map(f => f.id === sf.id ? { ...f, status: 'warning', message: [importWarning, 'Text read, but no clear event record was detected. Review the document content manually.'].filter(Boolean).join(' ') } : f));
          notify('No event candidates found. No facts were added.');
          return;
        }
      }
      const photoCount = parsed.reduce((total, event) => total + event.images.length, 0);
      const reviewCount = parsed.filter(eventNeedsReview).length;
      const successMessage = result.newsletterRows?.length
        ? `${importedCount} records detected · ${photoCount} photos · ${reviewCount} need review`
        : result.text ? `${importedCount} event candidate${importedCount === 1 ? '' : 's'} detected · ${reviewCount} need review` : 'No readable text found';
      setFiles(old => old.map(f => f.id === sf.id ? { ...f, status: importWarning ? 'warning' : 'done', message: [successMessage, importWarning].filter(Boolean).join(' · ') } : f));
      if (importWarning && result.text) notify('Text extracted with a review note.');
      else if (result.newsletterRows?.length) notify(`${importedCount} newsletter rows imported. Review categories, wording and images.`);
      else if (result.text) notify('Local analysis complete. Check every extracted detail.');
      else notify(result.warning || 'No text could be extracted.');
    } catch {
      setFiles(old => old.map(f => f.id === sf.id ? { ...f, status: 'error', message: 'Could not read this file. It may be damaged or unsupported.' } : f));
      notify('This file could not be processed.');
    }
  };
  const addFiles = async (selected: FileList | File[]) => {
    const incoming = Array.from(selected);
    if (!incoming.length) return;
    const acceptedFiles: SourceFile[] = [];
    incoming.forEach(file => {
      if (!file.size) { notify(`${file.name} is empty.`); return; }
      if (file.size > 30 * 1024 * 1024) { notify(`${file.name} is larger than the 30 MB per-file limit.`); return; }
      if (!allowedFile(file)) { notify(`${file.name} is not a supported format.`); return; }
      if (files.some(f => f.file.name === file.name && f.file.size === file.size)) { notify(`${file.name} is already in this session.`); return; }
      acceptedFiles.push({ id: uid(), file, status: 'ready' });
    });
    if (!acceptedFiles.length) return;
    setFiles(old => [...old, ...acceptedFiles]);
    setBusy(true);
    for (const sf of acceptedFiles) await analyzeFile(sf);
    setBusy(false);
  };
  const removeFile = (id: string) => setFiles(old => old.filter(f => f.id !== id));
  const startNewProject = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    eventsRef.current=[];
     setFiles([]); setEvents([]); setCategories(defaultCategories); setReviewThreshold(0.62); setReport(defaultReport); setPdfUrl(''); setSearch(''); setFilter('all'); setDuplicateQueue([]); setActiveEvent(null); setPendingDelete(null); setPage('upload'); setModal(null);
    setLogoName(''); setDepartmentLogoName(''); setCoverImageName('');
    notify('Session workspace cleared.');
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
    if (keepBoth && current) setEvents(old => [...old,{...current.candidate,order:old.length}]);
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
  const updateCategory = (id: string, patch: Partial<Category>) => setCategories(old => old.map(c => c.id === id ? { ...c, ...patch } : c));
  const addCategory = () => setCategories(old => [...old, { id: uid(), name: 'New category', keywords: [] }]);
  const removeCategory = (id: string) => {
    if (events.some(e => e.category === id)) { notify('Move or reclassify its events before removing this category.'); return; }
    setCategories(old => old.filter(c => c.id !== id)); setModal(null);
  };
  const moveEvent = (eventId: string, categoryId: string, beforeId?: string) => {
    setEvents(old => {
      const moved = old.find(e => e.id === eventId);
      if (!moved) return old;
      const target = old.filter(e => e.category === categoryId && e.id !== eventId).sort((a,b) => a.order-b.order);
      const idx = beforeId ? target.findIndex(e => e.id === beforeId) : target.length;
      target.splice(idx < 0 ? target.length : idx, 0, { ...moved, category: categoryId });
      const categoryOthers = old.filter(e => e.category !== categoryId && e.id !== eventId);
      const reindexed = target.map((e,i) => ({ ...e, category: categoryId, order: i }));
      return [...categoryOthers, ...reindexed];
    });
  };
  const missingReport = [
    !report.institution && 'Institution name',
    !report.department && 'Department',
    !report.academicYear && 'Academic year',
    !report.period && 'Reporting period',
    !events.length && 'At least one reviewed event',
    events.length && events.some(event => !event.name.trim()) && 'One or more event titles',
  ].filter(Boolean) as string[];

  const generatePdf = async () => {
    if (!events.length) { notify('Add or extract an event before generating a report.'); return; }
    try {
      const blob = await buildNewsletterPdf(report, events, categories);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(blob));
      setPage('report');
      notify('Newsletter PDF preview is ready.');
    } catch {
      notify('PDF generation failed. Check the photos and publication details, then try again.');
    }
  };

  const navItems: { id: Page; title: string; icon: typeof Upload; n: string }[] = [
    { id:'upload', title:'Upload & analyze', icon:Upload, n:'01' },
    { id:'review', title:'Review & arrange', icon:ClipboardList, n:'02' },
    { id:'dashboard', title:'Dashboard', icon:BarChart3, n:'03' },
    { id:'report', title:'Report & PDF', icon:BookOpen, n:'04' },
  ];
  const pageNames: Record<Page,string> = { upload:'Upload & analyze', review:'Review & arrange', dashboard:'Dashboard', report:'Report & PDF', settings:'Categories & keywords' };

  return <div className="studio">
    <aside className="rail">
      <div className="brand"><div className="brand-mark"><BookOpen size={18}/></div><div><div className="brand-name">Newsletter Studio</div><div className="brand-sub">Event publication builder</div></div></div>
      <div className="rail-label">Workspace</div>
      <div className="nav-row">{navItems.map((n)=><button key={n.id} className={`nav-item ${page===n.id?'active':''}`} onClick={()=>setPage(n.id)} data-testid={`nav-${n.id}`} aria-current={page===n.id?'page':undefined}><span className="step-num">{n.n}</span><n.icon size={16}/><span>{n.title}</span></button>)}</div>
      <div className="rail-label" style={{marginTop:20}}>Configure</div>
      <button className={`nav-item ${page==='settings'?'active':''}`} onClick={()=>setPage('settings')} data-testid="nav-categories"><Settings2 size={16}/><span>Categories & keywords</span></button>
      <div className="rail-spacer"/>
      <div className="privacy-note"><LockKeyhole size={15}/><span>Private session workspace.<br/>Files stay on this device and are cleared when you leave.</span></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="crumb"><span>Newsletter studio</span><ChevronRight size={13}/><b>{pageNames[page]}</b></div><div style={{display:'flex',alignItems:'center',gap:10}}><button className="btn small" onClick={()=>setModal('new-project')} data-testid="button-new-project-global"><RotateCcw size={13}/> New project</button><span className="session-pill"><i/> Local session only</span></div></header>
      {page==='upload' && <section className="page">
        <div className="page-head"><div><div className="eyebrow">Private workspace / Step 01</div><h1>Build the next issue.</h1><p className="lede">Start with the newsletter data-format DOCX. Its rows, descriptions and embedded photos are imported together, then grouped into the reference publication sections.</p></div><div className="head-actions"><button className="btn" onClick={()=>setModal('new-project')} data-testid="button-new-project"><RotateCcw size={15}/> New project</button>{events.length>0&&<button className="btn primary" onClick={()=>setPage('review')}>Review {events.length} event{events.length===1?'':'s'} <ChevronRight size={15}/></button>}</div></div>
        <div className="upload-grid">
          <div>
            <div className={`dropzone ${dragging?'dragging':''}`} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void addFiles(e.dataTransfer.files)}} data-testid="dropzone-files">
              <div className="drop-icon"><CloudUpload size={23}/></div><h3>Drop your newsletter data form here</h3><p>DOCX is best for matching each event with its photos · PDF, Word, JPG or PNG also supported · processed locally</p>
              <button className="btn primary" onClick={()=>fileRef.current?.click()} disabled={busy} data-testid="button-choose-files"><Plus size={15}/> Choose files</button>
              <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.jpg,.jpeg,.png" hidden onChange={e=>{if(e.target.files) void addFiles(e.target.files);e.target.value=''}} data-testid="input-files"/>
            </div>
            {files.length>0 && <div className="section-head"><h3>Source files <span>({files.length})</span></h3><button className="btn small danger" onClick={()=>setModal('clear')} data-testid="button-clear-files"><Trash2 size={13}/> Clear all</button></div>}
            <div className="file-list">{files.map(f=><div className="file-row" key={f.id} data-testid={`file-row-${f.id}`}>
              {f.file.type.startsWith('image/')?<FileImage size={17} className="file-icon"/>:<FileText size={17} className="file-icon"/>}
              <div className="file-main"><div className="file-name">{f.file.name}</div><div className="file-meta">{fmtSize(f.file.size)} · {f.message || (f.status==='working'?'Reading in browser…':'Ready to analyze')}</div></div>
              <span className={`state-tag ${f.status==='warning'?'warn':f.status==='error'?'error':''}`}>{f.status==='working'?'Reading':f.status==='done'?'Analyzed':f.status==='error'?'Problem':f.status==='warning'?'Review':'Ready'}</span>
              <button className="btn icon small" aria-label={`Remove ${f.file.name}`} onClick={()=>removeFile(f.id)} data-testid={`button-remove-file-${f.id}`}><X size={14}/></button>
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
        {files.filter(f=>f.status==='error'||f.status==='warning').map(f=><div className="alert" key={f.id}><CircleAlert size={16}/><span><strong>{f.file.name}:</strong> {f.message}</span><button className="btn small" onClick={()=>{const sf=files.find(x=>x.id===f.id);if(sf)void analyzeFile(sf)}}>Retry</button></div>)}
        <div className="section-head"><h3>Session overview</h3><span>Current working register</span></div>
        <div className="stats-grid">
          <div className="panel stat"><div className="stat-label">Source files</div><div className="stat-value">{files.length}</div><div className="stat-foot">Kept in this session</div></div>
          <div className="panel stat"><div className="stat-label">Event candidates</div><div className="stat-value">{events.length}</div><div className="stat-foot">From source wording only</div></div>
          <div className="panel stat"><div className="stat-label">Need your review</div><div className="stat-value">{needsReview.length}</div><div className="stat-foot">Uncertain or incomplete details</div></div>
          <div className="panel stat"><div className="stat-label">Categories</div><div className="stat-value">{categories.length}</div><div className="stat-foot">Editable keyword rules</div></div>
        </div>
      </section>}

      {page==='review' && <section className="page">
        <div className="page-head"><div><div className="eyebrow">Step 02 / Check every record</div><h1>Make the details true.</h1><p className="lede">Review extracted wording, correct what needs correcting, and arrange records into the right categories. Nothing becomes final until you say so.</p></div><div className="head-actions"><button className="btn" onClick={addBlankEvent} data-testid="button-add-event"><Plus size={15}/> Add event</button><button className="btn primary" onClick={()=>setPage('dashboard')}>View dashboard <ChevronRight size={15}/></button></div></div>
        {events.length===0 ? <div className="panel panel-pad" style={{textAlign:'center',padding:'60px 18px'}}><FolderOpen size={28} color="#74867a"/><h2 style={{marginTop:12}}>Your register is ready for source material</h2><p className="lede" style={{margin:'10px auto 18px'}}>Upload documents first, or add an event manually. No sample records have been included.</p><button className="btn primary" onClick={()=>setPage('upload')}>Go to upload</button> <button className="btn" onClick={addBlankEvent}><Plus size={14}/> Add event manually</button></div> :
        <>
          <div className="toolbar">
            <div className="searchbox"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search events, venues, source files…" aria-label="Search events" data-testid="input-search-events"/></div>
            <select className="select-control" value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filter events" data-testid="select-filter"><option value="all">All events ({events.length})</option><option value="review">Needs review ({needsReview.length})</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name} ({events.filter(e=>e.category===c.id).length})</option>)}</select>
            <button className="btn small" onClick={()=>setPage('settings')}><Settings2 size={14}/> Edit categories</button>
          </div>
          {needsReview.length>0 && <div className="callout" style={{marginBottom:14}}><Info size={15}/><span><strong>{needsReview.length} records need a second look.</strong> Some have uncertain classifications or are missing a title, date, venue, or description. Drag cards between columns to reclassify.</span></div>}
          <div className="category-board">{categories.map(cat=><div className="category-column" key={cat.id} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const dragged=e.dataTransfer.getData('text/event-id');if(dragged)moveEvent(dragged,cat.id)}} data-testid={`category-column-${cat.id}`}>
            <div className="cat-head"><div className="cat-title"><GripVertical size={13} color="#98a097"/>{cat.name}</div><span className="cat-count">{events.filter(e=>e.category===cat.id).length}</span></div>
            {filteredEvents.filter(e=>e.category===cat.id).sort((a,b)=>a.order-b.order).map((event,index)=><article className="event-card" key={event.id} draggable onDragStart={e=>e.dataTransfer.setData('text/event-id',event.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.stopPropagation();const draggingId=e.dataTransfer.getData('text/event-id');if(draggingId)moveEvent(draggingId,cat.id,event.id)}} data-testid={`event-card-${event.id}`}>
              {event.images.length ? <div className="event-card-photo-strip">{event.images.slice(0,3).map((image,imageIndex)=><img key={`${event.id}-photo-${imageIndex}`} src={image} alt={`${event.name || 'Event'} photo ${imageIndex + 1}`}/>)}</div> : <div className="event-card-no-photo"><FileImage size={15}/> No event photograph available</div>}
              <h3>{event.name||'Untitled event'}</h3><p>{event.description||'No description in source material.'}</p>
              <div className="event-meta"><span>{event.date||'Date not found'}</span><span title={`Classification confidence: ${Math.round(event.confidence*100)}%`} className={`confidence ${event.confidence<reviewThreshold?'low':''}`}>{Math.round(event.confidence*100)}% {event.confidence>=.8?'high':event.confidence>=.55?'medium':'low'}</span></div>
              <div className="classification-source">Classification: {event.classificationSource}</div>
              <div className="classification-source">Source: {event.sourceFile}{event.sourceEventType?` · ${event.sourceEventType}`:''}</div>
              {eventNeedsReview(event)&&<div className="review-banner"><CircleAlert size={11}/> Needs review · {event.classificationSource}{missingEventFields(event).length>0&&<span className="event-incomplete">Missing {missingEventFields(event).join(', ')}</span>}</div>}
              <div className="event-actions"><button className="btn" onClick={()=>openEdit(event)} aria-label={`Edit ${event.name}`} data-testid={`button-edit-${event.id}`}><Pencil size={13}/> Edit</button><button className="btn danger" onClick={()=>{setPendingDelete(event.id);setModal('delete')}} aria-label={`Delete ${event.name}`} data-testid={`button-delete-${event.id}`}><Trash2 size={13}/></button></div>
            </article>)}
            {filteredEvents.filter(e=>e.category===cat.id).length===0&&<div className="empty-column">{events.some(e=>e.category===cat.id)?'No matching events. Adjust search or filter.':'Drop an event here to classify it.'}</div>}
          </div>)}</div>
          {filteredEvents.length===0&&<div className="panel panel-pad" style={{textAlign:'center',marginTop:14,color:'#718075'}}>No events match this search.</div>}
        </>}
      </section>}

      {page==='dashboard' && <section className="page">
        <div className="page-head"><div><div className="eyebrow">Step 03 / Live register</div><h1>A view of the work.</h1><p className="lede">Counts and category distribution reflect the current edited register—not the original extraction.</p></div><div className="head-actions"><button className="btn" onClick={()=>setPage('review')}><ClipboardList size={15}/> Open register</button><button className="btn primary" onClick={()=>setPage('report')}>Report settings <ChevronRight size={15}/></button></div></div>
        <div className="stats-grid">
          <div className="panel stat"><div className="stat-label">Total events</div><div className="stat-value">{events.length}</div><div className="stat-foot">In current register</div></div>
          <div className="panel stat"><div className="stat-label">Categories in use</div><div className="stat-value">{counts.filter(c=>c.count>0).length}</div><div className="stat-foot">Of {categories.length} configured</div></div>
          <div className="panel stat"><div className="stat-label">Need review</div><div className="stat-value">{needsReview.length}</div><div className="stat-foot">Marked for verification</div></div>
          <div className="panel stat"><div className="stat-label">Ready to report</div><div className="stat-value">{events.length-needsReview.length}</div><div className="stat-foot">Not flagged for review</div></div>
        </div>
        <div className="section-head"><h3>Register health</h3><span>Live from editable event state</span></div>
        <div className="dashboard-grid">
          <div className="panel chart-card"><div className="chart-title"><div><h3>Event distribution by category</h3><p>Reclassify from the review board to update this chart.</p></div><ChartNoAxesColumnIncreasing size={17} color="#73877b"/></div>
            {counts.length? <CategoryPie counts={counts}/> : <div className="review-empty">Add a category to begin.</div>}
            {!events.length&&<p style={{margin:'16px 0 0',fontSize:11,color:'#849086'}}>The chart will populate from your edited register. No example data is shown.</p>}
          </div>
          <div className="panel review-card"><div className="chart-title"><div><h3>Needs a closer look</h3><p>Records with missing or uncertain details.</p></div><span className="cat-count">{needsReview.length}</span></div>
            {needsReview.length?needsReview.slice(0,5).map(e=><div className="review-item" key={e.id}><div className="review-dot"/><div style={{flex:1}}><strong>{e.name||'Untitled event'}</strong><small>{e.date||'Date not found'} · {e.sourceFile}</small></div><button className="btn small" onClick={()=>{setPage('review');openEdit(e)}}>Review</button></div>):<div className="review-empty"><Check size={21} color="#5d866b"/><span>No records are flagged right now.</span></div>}
            {needsReview.length>5&&<button className="btn small" style={{marginTop:8}} onClick={()=>{setFilter('review');setPage('review')}}>See all {needsReview.length}</button>}
          </div>
        </div>
        <div className="section-head"><h3>Category distribution</h3><span>{events.length} current records</span></div>
        <div className="panel panel-pad" style={{display:'flex',gap:12,flexWrap:'wrap'}}>{counts.map(c=><div key={c.id} style={{background:'#f2f0e7',borderRadius:8,padding:'12px 16px',minWidth:145,flex:'1'}}><div className="eyebrow">{c.name}</div><div style={{font:'24px Newsreader',color:'#31564a',marginTop:7}}>{c.count}<span style={{font:'11px DM Sans',color:'#849087'}}> events</span></div></div>)}</div>
      </section>}

      {page==='settings' && <section className="page">
        <div className="page-head"><div><div className="eyebrow">Workspace rules / Classification</div><h1>Set your own vocabulary.</h1><p className="lede">Weighted keyword matches are suggestions, not facts. Tune the categories and terms to match your faculty's language.</p></div><div className="head-actions"><button className="btn" onClick={addCategory} data-testid="button-add-category"><Plus size={15}/> Add category</button><button className="btn primary" onClick={()=>setPage('review')}><Check size={15}/> Done</button></div></div>
        <div className="callout" style={{marginBottom:17}}><Info size={15}/><span>Changing category names or keywords affects future analysis and chart labels. Existing events remain in the register and can be reclassified from the review board.</span></div>
        <div className="panel panel-pad" style={{marginBottom:16}}><div className="field-grid"><div className="field full"><label htmlFor="review-threshold">Flag low-confidence classifications below {Math.round(reviewThreshold * 100)}%</label><input id="review-threshold" type="range" min="25" max="95" step="1" value={Math.round(reviewThreshold * 100)} onChange={e=>setReviewThreshold(Number(e.target.value)/100)} aria-valuetext={`${Math.round(reviewThreshold * 100)} percent`}/><small style={{color:'#78857b'}}>This threshold applies to new analyses. Events without a date or category match are always flagged.</small></div></div></div>
        <div className="config-layout">{categories.map(cat=><div className="panel category-config" key={cat.id}>
          <div className="config-top"><input aria-label="Category name" value={cat.name} onChange={e=>updateCategory(cat.id,{name:e.target.value})} data-testid={`input-category-name-${cat.id}`}/><button className="btn icon danger" aria-label={`Remove category ${cat.name}`} onClick={()=>removeCategory(cat.id)} data-testid={`button-remove-category-${cat.id}`}><Trash2 size={14}/></button></div>
          <div className="keyword-head"><span>KEYWORD / PHRASE</span><span>WEIGHT</span></div>
          <div className="keyword-list">{cat.keywords.map((kw,i)=><div className="keyword-row" key={`${cat.id}-${i}`}>
            <input value={kw.term} aria-label={`Keyword ${i+1}`} onChange={e=>updateCategory(cat.id,{keywords:cat.keywords.map((x,j)=>j===i?{...x,term:e.target.value}:x)})}/>
            <input type="number" min="1" max="10" value={kw.weight} aria-label={`Weight for ${kw.term}`} onChange={e=>updateCategory(cat.id,{keywords:cat.keywords.map((x,j)=>j===i?{...x,weight:Math.max(1,Number(e.target.value)||1)}:x)})}/>
            <button className="btn icon small danger" aria-label={`Remove ${kw.term}`} onClick={()=>updateCategory(cat.id,{keywords:cat.keywords.filter((_,j)=>j!==i)})}><X size={13}/></button>
          </div>)}</div>
          <button className="btn small" style={{marginTop:11}} onClick={()=>updateCategory(cat.id,{keywords:[...cat.keywords,{term:'',weight:1}]})}><Plus size={13}/> Add keyword</button>
          <div className="stat-foot" style={{marginTop:12}}>Currently assigned: {events.filter(e=>e.category===cat.id).length} events</div>
        </div>)}</div>
      </section>}

      {page==='report' && <section className="page">
        <div className="page-head"><div><div className="eyebrow">Step 04 / Publication details</div><h1>Set up this newsletter issue.</h1><p className="lede">Add the issue details and editable front matter, upload the college and department marks, then generate a magazine-style PDF from the reviewed event register.</p></div><div className="head-actions"><button className="btn" onClick={()=>setPage('dashboard')}><BarChart3 size={15}/> Dashboard</button><button className="btn primary" onClick={()=>void generatePdf()} disabled={!events.length} data-testid="button-generate-pdf"><Sparkles size={15}/> Generate PDF</button></div></div>
        <div className="settings-columns">
          <div>
            <div className="panel panel-pad"><div className="section-head" style={{margin:'0 0 17px'}}><h3>Publication details</h3><span>Optional, but recommended</span></div>
              <div className="field-grid">
                <div className="field"><label htmlFor="institution">Institution</label><input id="institution" value={report.institution} onChange={e=>setReport({...report,institution:e.target.value})} placeholder="Institution name" data-testid="input-institution"/></div>
                <div className="field"><label htmlFor="department">Department / faculty</label><input id="department" value={report.department} onChange={e=>setReport({...report,department:e.target.value})} placeholder="Department name" data-testid="input-department"/></div>
                <div className="field full"><label htmlFor="report-title">Newsletter title</label><input id="report-title" value={report.title} onChange={e=>setReport({...report,title:e.target.value})} placeholder="Faculty Events Newsletter"/></div>
                <div className="field"><label htmlFor="report-volume">Volume</label><input id="report-volume" value={report.volume} onChange={e=>setReport({...report,volume:e.target.value})} placeholder="e.g. 4"/></div>
                <div className="field"><label htmlFor="report-issue">Issue</label><input id="report-issue" value={report.issue} onChange={e=>setReport({...report,issue:e.target.value})} placeholder="e.g. 1"/></div>
                <div className="field"><label htmlFor="year">Academic year</label><input id="year" value={report.academicYear} onChange={e=>setReport({...report,academicYear:e.target.value})} placeholder="e.g. 2024–25"/></div>
                <div className="field"><label htmlFor="period">Reporting period</label><input id="period" value={report.period} onChange={e=>setReport({...report,period:e.target.value})} placeholder="e.g. Autumn semester"/></div>
                <div className="field full"><label htmlFor="subtitle">Subtitle</label><input id="subtitle" value={report.subtitle} onChange={e=>setReport({...report,subtitle:e.target.value})} placeholder="Optional cover line"/></div>
                <div className="field full"><label htmlFor="cover-lead">Cover lead-in</label><input id="cover-lead" value={report.coverLead} onChange={e=>setReport({...report,coverLead:e.target.value})} placeholder="Optional second cover statement"/></div>
              </div>
            </div>
            <div className="panel panel-pad" style={{marginTop:14}}>
              <div className="section-head" style={{margin:'0 0 14px'}}><h3>Cover and marks</h3><span>Images stay in this session</span></div>
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="institution-logo">Institution logo</label>
                  <div className="asset-upload">
                    {report.logo && <img className="logo-preview" src={report.logo} alt="Institution logo preview"/>}
                    <div className="asset-actions">
                      <button className="btn small" onClick={()=>logoRef.current?.click()}><ImagePlus size={14}/>{report.logo?'Replace logo':'Add logo'}</button>
                      {report.logo && <button className="btn small danger" onClick={()=>{setReport({...report,logo:''});setLogoName('')}}>Remove</button>}
                      {logoName&&<small>{logoName}</small>}
                    </div>
                    <input id="institution-logo" ref={logoRef} hidden type="file" accept="image/png,image/jpeg" onChange={async e=>{
                      const f=e.target.files?.[0];
                      if(f){setReport({...report,logo:await imageToDataUrl(f)});setLogoName(f.name);}
                      e.target.value='';
                    }} data-testid="input-logo"/>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="department-logo">Department mark</label>
                  <div className="asset-upload">
                    {report.departmentLogo && <img className="logo-preview" src={report.departmentLogo} alt="Department logo preview"/>}
                    <div className="asset-actions">
                      <button className="btn small" onClick={()=>departmentLogoRef.current?.click()}><ImagePlus size={14}/>{report.departmentLogo?'Replace mark':'Add mark'}</button>
                      {report.departmentLogo && <button className="btn small danger" onClick={()=>{setReport({...report,departmentLogo:''});setDepartmentLogoName('')}}>Remove</button>}
                      {departmentLogoName&&<small>{departmentLogoName}</small>}
                    </div>
                    <input id="department-logo" ref={departmentLogoRef} hidden type="file" accept="image/png,image/jpeg" onChange={async e=>{
                      const f=e.target.files?.[0];
                      if(f){setReport({...report,departmentLogo:await imageToDataUrl(f)});setDepartmentLogoName(f.name);}
                      e.target.value='';
                    }}/>
                  </div>
                </div>
                <div className="field full">
                  <label htmlFor="cover-photo">Cover photograph</label>
                  <div className="asset-upload">
                    {report.coverImage && <img className="cover-preview" src={report.coverImage} alt="Newsletter cover preview"/>}
                    <div className="asset-actions">
                      <button className="btn small" onClick={()=>coverImageRef.current?.click()}><ImagePlus size={14}/>{report.coverImage?'Replace photo':'Add campus photo'}</button>
                      {report.coverImage && <button className="btn small danger" onClick={()=>{setReport({...report,coverImage:''});setCoverImageName('')}}>Remove</button>}
                      {coverImageName&&<small>{coverImageName}</small>}
                    </div>
                    <input id="cover-photo" ref={coverImageRef} hidden type="file" accept="image/png,image/jpeg" onChange={async e=>{
                      const f=e.target.files?.[0];
                      if(f){setReport({...report,coverImage:await imageToCoverDataUrl(f)});setCoverImageName(f.name);}
                      e.target.value='';
                    }}/>
                  </div>
                </div>
              </div>
            </div>
            <div className="panel panel-pad" style={{marginTop:14}}>
              <div className="section-head" style={{margin:'0 0 14px'}}><h3>Cover and front matter</h3><span>Enter the text to include in this issue</span></div>
              <div className="field-grid">
                <div className="field full"><label htmlFor="tagline">Cover statement</label><input id="tagline" value={report.tagline} onChange={e=>setReport({...report,tagline:e.target.value})}/></div>
                <div className="field full"><label htmlFor="college-profile">College profile</label><textarea id="college-profile" rows={5} value={report.collegeProfile} onChange={e=>setReport({...report,collegeProfile:e.target.value})}/></div>
                <div className="field full"><label htmlFor="department-tagline">Department introduction</label><input id="department-tagline" value={report.departmentTagline} onChange={e=>setReport({...report,departmentTagline:e.target.value})}/></div>
                <div className="field full"><label htmlFor="vision">Department vision</label><textarea id="vision" rows={3} value={report.vision} onChange={e=>setReport({...report,vision:e.target.value})}/></div>
                <div className="field full"><label htmlFor="mission">Department mission</label><textarea id="mission" rows={4} value={report.mission} onChange={e=>setReport({...report,mission:e.target.value})}/></div>
                <div className="field full"><label htmlFor="hod-message">Message from the HOD</label><textarea id="hod-message" rows={6} value={report.hodMessage} onChange={e=>setReport({...report,hodMessage:e.target.value})}/></div>
                <div className="field"><label htmlFor="hod-name">HOD name</label><input id="hod-name" value={report.hodName} onChange={e=>setReport({...report,hodName:e.target.value})}/></div>
                <div className="field"><label htmlFor="hod-role">HOD role</label><input id="hod-role" value={report.hodRole} onChange={e=>setReport({...report,hodRole:e.target.value})}/></div>
                <div className="field full"><label htmlFor="editorial-team">Editorial team</label><textarea id="editorial-team" rows={4} value={report.editorialTeam} onChange={e=>setReport({...report,editorialTeam:e.target.value})}/></div>
              </div>
            </div>
            <div className="panel panel-pad" style={{marginTop:14}}><div className="section-head" style={{margin:'0 0 6px'}}><h3>Before you publish</h3><span>{missingReport.length?`${missingReport.length} item${missingReport.length===1?'':'s'} to check`:'Details complete'}</span></div>
              {missingReport.length?<><p style={{fontSize:11,color:'#829087',margin:'0 0 6px'}}>You can still generate a report; fill these in where applicable.</p><ul className="missing-list">{missingReport.map(x=><li key={x}>{x}</li>)}</ul></>:<div className="guide-line"><Check size={16} color="#507b5b"/><span>Publication fields are present and the register contains records.</span></div>}
              {needsReview.length>0&&<div className="alert" style={{marginTop:12}}><CircleAlert size={15}/><span>{needsReview.length} event{needsReview.length===1?'':'s'} remain flagged for review. These are included in the PDF with their current edited details.</span></div>}
            </div>
          </div>
          <div className="preview-wrap">
             <div className="preview-toolbar"><div><strong style={{fontSize:12}}>PDF preview</strong><div style={{fontSize:10,color:'#818b82',marginTop:3}}>{pdfUrl?'Generated from current state':'Generate to preview'}</div></div>{pdfUrl&&<a href={pdfUrl} download={pdfFilename(report)} className="btn small primary" data-testid="link-download-pdf"><Download size={14}/> Download PDF</a>}</div>
            {pdfUrl?<iframe className="pdf-frame" src={pdfUrl} title="Generated newsletter PDF preview" data-testid="frame-pdf-preview"/>:<div className="no-preview"><BookOpen size={27}/><strong>Your publication takes shape here.</strong><span>Generate a PDF to preview the cover, department profile and event sections.</span><span style={{fontSize:10}}>No files leave this browser.</span></div>}
          </div>
        </div>
      </section>}
    </main>

    {(modal==='edit'||modal==='add')&&activeEvent&&<EventModal event={activeEvent} categories={categories} onClose={()=>{setModal(null);setActiveEvent(null)}} onSave={saveEvent} onImages={addEventImages} title={modal==='add'?'Add an event':'Review event details'} />}
    {modal==='delete'&&<ConfirmModal title="Remove this event?" detail="This event will be removed from the current session register. The source file remains available." cancel={()=>setModal(null)} confirm={deleteEvent} confirmText="Remove event"/>}
    {modal==='clear'&&<ConfirmModal title="Clear source files?" detail="All uploaded files and their extracted event records will be removed from this session. This cannot be undone." cancel={()=>setModal(null)} confirm={()=>{eventsRef.current=[];setFiles([]);setEvents([]);setDuplicateQueue([]);setPdfUrl('');setModal(null);notify('Files and extracted records cleared.')}} confirmText="Clear files"/>}
    {modal==='new-project'&&<ConfirmModal title="Start a new project?" detail="The current files, event edits, report details and preview will be cleared from memory. This action cannot be undone." cancel={()=>setModal(null)} confirm={startNewProject} confirmText="Clear workspace"/>}
    {modal==='duplicate'&&duplicateQueue[0]&&<div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="duplicate-title"><div className="modal-head"><div><div className="eyebrow">Possible duplicate · {duplicateQueue.length} remaining</div><h2 id="duplicate-title">This event may already be here.</h2><p>Review both records. The match is based on event-name and detail similarity.</p></div><button className="btn icon" onClick={()=>resolveDuplicate(false)} aria-label="Skip candidate"><X size={16}/></button></div><div className="duplicate-box"><strong>Existing event</strong><div>{duplicateQueue[0].match.name}</div><small>{duplicateQueue[0].match.date||'No date recorded'} · {duplicateQueue[0].match.sourceFile}</small></div><div className="duplicate-box"><strong>New source wording</strong><div>{duplicateQueue[0].candidate.name}</div><small>{duplicateQueue[0].candidate.date||'No date recorded'} · {duplicateQueue[0].candidate.sourceFile}</small></div><div className="modal-footer"><button className="btn" onClick={()=>resolveDuplicate(false)}>Discard candidate</button><div><button className="btn primary" onClick={()=>{resolveDuplicate(true);notify('Candidate added for review.')}}>Keep both events</button></div></div></div></div>}
    {toast&&<div className="toast-note" role="status">{toast}</div>}
  </div>;
}

function CategoryPie({counts}:{counts:Array<Category & {count:number}>}) {
  const active = counts.filter(category => category.count > 0);
  const total = active.reduce((sum, category) => sum + category.count, 0);
  let cursor = -Math.PI / 2;
  const slices = active.map(category => {
    const start = cursor;
    const end = cursor + (total ? category.count / total : 0) * Math.PI * 2;
    cursor = end;
    return { category, start, end, color: chartColors[Math.max(0, counts.findIndex(item => item.id === category.id)) % chartColors.length] };
  });
  return <div className="pie-layout">
    <svg className="pie-svg" viewBox="0 0 180 180" role="img" aria-label={`Event distribution by category, ${total} events`}>
      {slices.length === 1
        ? <circle cx="90" cy="90" r="70" fill={slices[0].color}/>
        : slices.map(({category,start,end,color})=><path key={category.id} d={piePath(90,90,70,start,end)} fill={color} stroke="#faf9f5" strokeWidth="1.5"/>)}
      <circle cx="90" cy="90" r="45" fill="#faf9f5"/>
      <text x="90" y="86" textAnchor="middle" className="pie-total">{total}</text>
      <text x="90" y="103" textAnchor="middle" className="pie-total-label">events</text>
    </svg>
    <div className="pie-legend">{counts.map((category,index)=><div className="pie-legend-row" key={category.id}>
      <i style={{background:chartColors[index % chartColors.length]}}/><span title={category.name}>{category.name}</span><strong>{category.count}</strong>
    </div>)}</div>
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
      <div className="field"><label htmlFor="ev-category">Category</label><select id="ev-category" value={draft.category} onChange={e=>{setDraft(old=>({...old,category:e.target.value,classificationSource:'Manually assigned',needsReview:false}))}}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
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
