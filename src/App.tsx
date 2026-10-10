import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Check,
  Sparkles,
  ShieldCheck,
  Search,
  Lock,
  LogOut,
  Plus,
  X,
  ChevronRight,
  Copy,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Instagram,
  Phone,
  MapPin,
  FileText,
  SlidersHorizontal,
  Ban,
} from 'lucide-react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  getDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  StudioService,
  BookedSlotRecord,
  AppointmentRecord,
  ServiceCategory,
  NailShape,
  NailFinish,
  AppointmentStatus,
  STUDIO_IMAGES,
  NAIL_SHAPES,
  NAIL_FINISHES,
  STUDIO_HOURS,
  DEFAULT_STUDIO_SERVICES,
  formatCurrencyBRL,
  formatDuration,
  formatDateBR,
  getNextDays,
  generateProtocolCode,
} from './types';

function ResilientImage({
  src,
  alt,
  className = '',
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[#EFE8E2] text-[#6B5D57] p-6 text-center ${className}`}
      >
        <Sparkles className="w-6 h-6 mb-2 text-[#9E5A63]" />
        <span className="font-serif-display text-base italic">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

export default function App() {
  // Active view mode: 'client' (public studio & booking) or 'admin' (painel Mariana)
  const [viewMode, setViewMode] = useState<'client' | 'admin'>('client');

  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Studio Services & Public Booked Slots
  const [firestoreServices, setFirestoreServices] = useState<StudioService[]>([]);
  const [bookedSlots, setBookedSlots] = useState<BookedSlotRecord[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);

  // Admin Appointments State
  const [adminAppointments, setAdminAppointments] = useState<AppointmentRecord[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);

  // Client Booking Flow State
  const [categoryFilter, setCategoryFilter] = useState<string>('Todos');
  const availableDays = useMemo(() => getNextDays(14), []);
  const firstOpenDay = useMemo(
    () => availableDays.find((d) => !d.isSunday)?.iso || availableDays[0].iso,
    [availableDays]
  );

  const [selectedServiceId, setSelectedServiceId] = useState<string>(
    DEFAULT_STUDIO_SERVICES[0].id
  );
  const [selectedNailShape, setSelectedNailShape] = useState<NailShape>('Amendoada');
  const [selectedNailFinish, setSelectedNailFinish] = useState<NailFinish>(
    'Francesa Reversa / Sorriso'
  );
  const [selectedDate, setSelectedDate] = useState<string>(firstOpenDay);
  const [selectedTime, setSelectedTime] = useState<string>('10:30');

  // Client Form Inputs
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientInstagram, setClientInstagram] = useState('');
  const [clientNotes, setClientNotes] = useState('');
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3>(1);
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [bookingFormError, setBookingFormError] = useState<string | null>(null);

  // Confirmed Receipt State & Local Saved Appointments
  const [confirmedReceipt, setConfirmedReceipt] = useState<AppointmentRecord | null>(
    null
  );
  const [copiedProtocol, setCopiedProtocol] = useState(false);

  // Protocol Lookup Modal / Section State
  const [lookupInput, setLookupInput] = useState('');
  const [lookupResult, setLookupResult] = useState<AppointmentRecord | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  // Admin Dashboard Filters & Modals
  const [adminTab, setAdminTab] = useState<'agenda' | 'servicos' | 'horarios'>(
    'agenda'
  );
  const [adminStatusFilter, setAdminStatusFilter] = useState<string>('todos');
  const [adminDateFilter, setAdminDateFilter] = useState<string>('');
  const [adminSearch, setAdminSearch] = useState<string>('');
  const [blockDate, setBlockDate] = useState<string>(firstOpenDay);
  const [blockTime, setBlockTime] = useState<string>('09:00');
  const [blockingSlot, setBlockingSlot] = useState(false);

  // New Service Form in Admin
  const [showNewServiceModal, setShowNewServiceModal] = useState(false);
  const [newSvcName, setNewSvcName] = useState('');
  const [newSvcCategory, setNewSvcCategory] =
    useState<ServiceCategory>('Alongamento');
  const [newSvcDesc, setNewSvcDesc] = useState('');
  const [newSvcDuration, setNewSvcDuration] = useState(120);
  const [newSvcPriceBRL, setNewSvcPriceBRL] = useState('160');
  const [newSvcImageKey, setNewSvcImageKey] = useState('french_atelier');
  const [savingService, setSavingService] = useState(false);

  // Combine default studio services with any custom Firestore services
  const servicesCatalog = useMemo(() => {
    if (firestoreServices.length === 0) return DEFAULT_STUDIO_SERVICES;
    const map = new Map<string, StudioService>();
    DEFAULT_STUDIO_SERVICES.forEach((s) => map.set(s.id, s));
    firestoreServices.forEach((s) => map.set(s.id, s));
    return Array.from(map.values()).filter((s) => s.active);
  }, [firestoreServices]);

  const selectedService = useMemo(
    () =>
      servicesCatalog.find((s) => s.id === selectedServiceId) ||
      servicesCatalog[0],
    [servicesCatalog, selectedServiceId]
  );

  const isAdminUser = useMemo(() => {
    if (!currentUser) return false;
    return currentUser.email === 'lyalua31@gmail.com' && currentUser.emailVerified;
  }, [currentUser]);

  // 1. Listen to Auth State
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // 2. Listen to Public Booked Slots & Services
  useEffect(() => {
    const slotsRef = collection(db, 'bookedSlots');
    const unsubSlots = onSnapshot(
      slotsRef,
      (snap) => {
        const list: BookedSlotRecord[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            date: data.date,
            time: data.time,
            durationMinutes: data.durationMinutes,
            status: data.status,
            appointmentId: data.appointmentId,
          });
        });
        setBookedSlots(list);
        setSlotsLoading(false);
      },
      (err) => {
        setSlotsLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'bookedSlots');
      }
    );

    const servicesRef = collection(db, 'services');
    const unsubServices = onSnapshot(
      servicesRef,
      (snap) => {
        const list: StudioService[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          list.push({
            id: docSnap.id,
            name: data.name,
            category: data.category,
            description: data.description,
            durationMinutes: data.durationMinutes,
            priceCents: data.priceCents,
            imageKey: data.imageKey,
            active: data.active,
          });
        });
        setFirestoreServices(list);
      },
      () => {
        // Fallback to default studio services silently if empty
      }
    );

    return () => {
      unsubSlots();
      unsubServices();
    };
  }, []);

  // 3. Listen to Admin Appointments when authenticated as verified Admin
  useEffect(() => {
    if (!authReady || !isAdminUser) {
      setAdminAppointments([]);
      return;
    }

    setAdminLoading(true);
    const q = query(collection(db, 'appointments'), orderBy('date', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: AppointmentRecord[] = [];
        snap.forEach((d) => {
          const data = d.data();
          items.push({
            id: d.id,
            protocolCode: data.protocolCode,
            clientName: data.clientName,
            clientPhone: data.clientPhone,
            clientInstagram: data.clientInstagram,
            serviceId: data.serviceId,
            serviceName: data.serviceName,
            serviceCategory: data.serviceCategory,
            priceCents: data.priceCents,
            durationMinutes: data.durationMinutes,
            nailShape: data.nailShape,
            nailFinish: data.nailFinish,
            date: data.date,
            time: data.time,
            slotId: data.slotId,
            notes: data.notes,
            status: data.status,
          });
        });
        setAdminAppointments(items);
        setAdminLoading(false);
      },
      (err) => {
        setAdminLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'appointments');
      }
    );

    return () => unsub();
  }, [authReady, isAdminUser]);

  // Compute occupied times for selectedDate
  const occupiedTimesForSelectedDate = useMemo(() => {
    const map = new Map<string, BookedSlotRecord>();
    bookedSlots.forEach((slot) => {
      if (
        slot.date === selectedDate &&
        (slot.status === 'pending' ||
          slot.status === 'confirmed' ||
          slot.status === 'blocked')
      ) {
        map.set(slot.time, slot);
      }
    });
    return map;
  }, [bookedSlots, selectedDate]);

  // Keep selectedTime valid if current selection becomes occupied
  useEffect(() => {
    if (occupiedTimesForSelectedDate.has(selectedTime)) {
      const firstFree = STUDIO_HOURS.find(
        (h) => !occupiedTimesForSelectedDate.has(h)
      );
      if (firstFree) setSelectedTime(firstFree);
    }
  }, [occupiedTimesForSelectedDate, selectedTime]);

  // Select service from catalog card and scroll to booking module
  const handleChooseServiceCard = (service: StudioService) => {
    setSelectedServiceId(service.id);
    if (service.id.includes('encapsulado')) {
      setSelectedNailFinish('Encapsulada com Flores / Ouro');
    } else if (service.id.includes('cat-eye')) {
      setSelectedNailFinish('Cat-Eye / Cromado Prata');
    } else if (service.id.includes('baby-boomer')) {
      setSelectedNailFinish('Baby Boomer & Glitter');
    } else {
      setSelectedNailFinish('Francesa Reversa / Sorriso');
    }
    setBookingStep(1);
    const el = document.getElementById('agendamento');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  // Submit New Client Appointment (Atomic Batch: appointments + bookedSlots)
  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingFormError(null);

    const trimmedName = clientName.trim().slice(0, 80);
    const trimmedPhone = clientPhone.trim().slice(0, 25);
    const trimmedInsta = (clientInstagram.trim() || '@cliente').slice(0, 50);
    const trimmedNotes = (clientNotes.trim() || 'Sem observações adicionais.').slice(
      0,
      250
    );

    if (trimmedName.length < 2) {
      setBookingFormError('Por favor, informe seu nome completo (mínimo 2 caracteres).');
      return;
    }
    if (trimmedPhone.length < 8) {
      setBookingFormError('Informe um WhatsApp válido com DDD para envio da confirmação.');
      return;
    }
    if (occupiedTimesForSelectedDate.has(selectedTime)) {
      setBookingFormError('Este horário acabou de ser reservado. Escolha outro horário.');
      return;
    }

    setSubmittingBooking(true);
    const protocolCode = generateProtocolCode();
    const appointmentId = protocolCode; // Matches ^[a-zA-Z0-9_\-]+$ and allows direct protocol lookup
    const slotId = `slot_${selectedDate}_${selectedTime.replace(':', '')}`;

    const appointmentPayload = {
      protocolCode,
      clientName: trimmedName,
      clientPhone: trimmedPhone,
      clientInstagram: trimmedInsta,
      serviceId: selectedService.id,
      serviceName: selectedService.name.slice(0, 80),
      serviceCategory: selectedService.category.slice(0, 40),
      priceCents: selectedService.priceCents,
      durationMinutes: selectedService.durationMinutes,
      nailShape: selectedNailShape,
      nailFinish: selectedNailFinish,
      date: selectedDate,
      time: selectedTime,
      slotId,
      notes: trimmedNotes,
      status: 'pending' as AppointmentStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const slotPayload = {
      date: selectedDate,
      time: selectedTime,
      durationMinutes: selectedService.durationMinutes,
      status: 'pending' as const,
      appointmentId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'appointments', appointmentId), appointmentPayload);
      batch.set(doc(db, 'bookedSlots', slotId), slotPayload);
      await batch.commit();

      const createdRecord: AppointmentRecord = {
        id: appointmentId,
        ...appointmentPayload,
      };
      setConfirmedReceipt(createdRecord);
      try {
        localStorage.setItem(
          'nails_mariana_last_protocol',
          JSON.stringify(createdRecord)
        );
      } catch {
        // Ignore storage error in restricted iframes
      }
      setBookingStep(3);
    } catch (error) {
      setBookingFormError(
        'Não foi possível concluir a reserva. Verifique os dados ou tente outro horário.'
      );
      handleFirestoreError(error, OperationType.WRITE, `appointments/${appointmentId}`);
    } finally {
      setSubmittingBooking(false);
    }
  };

  // Lookup appointment by Protocol Code (MC-XXXXXX)
  const handleLookupProtocol = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError(null);
    setLookupResult(null);

    const normalized = lookupInput.trim().toUpperCase();
    if (!/^MC-[A-Z0-9]{6}$/.test(normalized)) {
      setLookupError('Informe um protocolo válido no formato MC-XXXXXX.');
      return;
    }

    setLookupLoading(true);
    try {
      const snap = await getDoc(doc(db, 'appointments', normalized));
      if (!snap.exists()) {
        setLookupError('Nenhum agendamento encontrado com este código de protocolo.');
      } else {
        const d = snap.data();
        setLookupResult({
          id: snap.id,
          protocolCode: d.protocolCode,
          clientName: d.clientName,
          clientPhone: d.clientPhone,
          clientInstagram: d.clientInstagram,
          serviceId: d.serviceId,
          serviceName: d.serviceName,
          serviceCategory: d.serviceCategory,
          priceCents: d.priceCents,
          durationMinutes: d.durationMinutes,
          nailShape: d.nailShape,
          nailFinish: d.nailFinish,
          date: d.date,
          time: d.time,
          slotId: d.slotId,
          notes: d.notes,
          status: d.status,
        });
      }
    } catch (error) {
      setLookupError('Erro ao consultar o protocolo.');
      handleFirestoreError(error, OperationType.GET, `appointments/${normalized}`);
    } finally {
      setLookupLoading(false);
    }
  };

  // Client cancels their own pending appointment
  const handleClientCancelAppointment = async (appt: AppointmentRecord) => {
    if (appt.status !== 'pending') return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'appointments', appt.id), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'bookedSlots', appt.slotId), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
      await batch.commit();

      if (confirmedReceipt && confirmedReceipt.id === appt.id) {
        setConfirmedReceipt({ ...confirmedReceipt, status: 'cancelled' });
      }
      if (lookupResult && lookupResult.id === appt.id) {
        setLookupResult({ ...lookupResult, status: 'cancelled' });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `appointments/${appt.id}`);
    }
  };

  // Admin Updates Appointment Status
  const handleAdminStatusChange = async (
    appt: AppointmentRecord,
    newStatus: AppointmentStatus
  ) => {
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'appointments', appt.id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      const slotStatus =
        newStatus === 'cancelled'
          ? 'cancelled'
          : newStatus === 'confirmed' || newStatus === 'completed'
          ? 'confirmed'
          : 'pending';
      batch.update(doc(db, 'bookedSlots', appt.slotId), {
        status: slotStatus,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `appointments/${appt.id}`);
    }
  };

  // Admin Blocks or Unblocks a specific date/time slot
  const handleAdminToggleBlockSlot = async (date: string, time: string) => {
    setBlockingSlot(true);
    const slotId = `slot_${date}_${time.replace(':', '')}`;
    const existingSlot = bookedSlots.find(
      (s) => s.date === date && s.time === time && s.status !== 'cancelled'
    );

    try {
      if (existingSlot && existingSlot.status === 'blocked') {
        await updateDoc(doc(db, 'bookedSlots', existingSlot.id), {
          status: 'cancelled',
          updatedAt: serverTimestamp(),
        });
      } else if (!existingSlot) {
        await setDoc(doc(db, 'bookedSlots', slotId), {
          date,
          time,
          durationMinutes: 90,
          status: 'blocked',
          appointmentId: `block_${date}_${time.replace(':', '')}`,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `bookedSlots/${slotId}`);
    } finally {
      setBlockingSlot(false);
    }
  };

  // Admin Creates a New Service in Catalog
  const handleAdminCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newSvcName.trim().length < 2 || newSvcDesc.trim().length < 5) return;
    setSavingService(true);
    const serviceId = `svc_${Date.now()}`;
    const priceCents = Math.max(
      0,
      Math.min(500000, Math.round(Number(newSvcPriceBRL.replace(',', '.')) * 100) || 15000)
    );

    try {
      await setDoc(doc(db, 'services', serviceId), {
        name: newSvcName.trim().slice(0, 80),
        category: newSvcCategory,
        description: newSvcDesc.trim().slice(0, 300),
        durationMinutes: Math.max(15, Math.min(360, Number(newSvcDuration) || 120)),
        priceCents,
        imageKey: newSvcImageKey,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNewSvcName('');
      setNewSvcDesc('');
      setShowNewServiceModal(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `services/${serviceId}`);
    } finally {
      setSavingService(false);
    }
  };

  // Admin Login Handler
  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Erro ao autenticar com o Google.'
      );
    }
  };

  // Filtered Services for Storefront
  const filteredServices = useMemo(() => {
    if (categoryFilter === 'Todos') return servicesCatalog;
    return servicesCatalog.filter((s) => s.category === categoryFilter);
  }, [servicesCatalog, categoryFilter]);

  // Filtered Appointments for Admin
  const filteredAdminAppointments = useMemo(() => {
    return adminAppointments.filter((a) => {
      if (adminStatusFilter !== 'todos' && a.status !== adminStatusFilter) {
        return false;
      }
      if (adminDateFilter && a.date !== adminDateFilter) {
        return false;
      }
      if (adminSearch.trim()) {
        const q = adminSearch.toLowerCase();
        return (
          a.clientName.toLowerCase().includes(q) ||
          a.protocolCode.toLowerCase().includes(q) ||
          a.serviceName.toLowerCase().includes(q) ||
          a.clientInstagram.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [adminAppointments, adminStatusFilter, adminDateFilter, adminSearch]);

  // Admin Metrics
  const adminMetrics = useMemo(() => {
    const pendingCount = adminAppointments.filter(
      (a) => a.status === 'pending'
    ).length;
    const confirmedCount = adminAppointments.filter(
      (a) => a.status === 'confirmed'
    ).length;
    const completedCount = adminAppointments.filter(
      (a) => a.status === 'completed'
    ).length;
    const expectedRevenueCents = adminAppointments
      .filter((a) => a.status === 'confirmed' || a.status === 'completed')
      .reduce((acc, cur) => acc + cur.priceCents, 0);

    return {
      pendingCount,
      confirmedCount,
      completedCount,
      expectedRevenueCents,
    };
  }, [adminAppointments]);

  const copyProtocolToClipboard = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedProtocol(true);
    setTimeout(() => setCopiedProtocol(false), 2000);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F5] text-[#231C1A]">
      {/* TOP BAR CONTRACT: Strictly 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-8 px-6 lg:px-12 py-4 bg-[#FAF7F5]/95 backdrop-blur-sm border-b border-[#E6DCD5]">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#inicio"
          onClick={(e) => {
            e.preventDefault();
            setViewMode('client');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="font-serif-display text-2xl font-semibold tracking-tight text-[#231C1A] whitespace-nowrap shrink-0"
        >
          nails.marianacastro
        </a>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#6B5D57]">
          <a
            href="#servicos"
            onClick={() => setViewMode('client')}
            className="hover:text-[#231C1A] transition-colors whitespace-nowrap shrink-0"
          >
            Procedimentos
          </a>
          <a
            href="#portfolio"
            onClick={() => setViewMode('client')}
            className="hover:text-[#231C1A] transition-colors whitespace-nowrap shrink-0"
          >
            Portfólio
          </a>
          <a
            href="#agendamento"
            onClick={() => setViewMode('client')}
            className="hover:text-[#231C1A] transition-colors whitespace-nowrap shrink-0"
          >
            Agendar Horário
          </a>
          <a
            href="#consultar"
            onClick={() => setViewMode('client')}
            className="hover:text-[#231C1A] transition-colors whitespace-nowrap shrink-0"
          >
            Meu Horário
          </a>
          <button
            type="button"
            onClick={() =>
              setViewMode(viewMode === 'client' ? 'admin' : 'client')
            }
            className="hover:text-[#231C1A] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {viewMode === 'client' ? 'Painel Estúdio' : 'Visão da Cliente'}
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          {viewMode === 'client' ? (
            <a
              href="#agendamento"
              className="px-5 py-2.5 text-xs font-semibold tracking-wide text-white bg-[#9E5A63] rounded-lg hover:bg-[#874952] transition-colors whitespace-nowrap shrink-0"
            >
              Agendar Agora
            </a>
          ) : (
            <button
              type="button"
              onClick={() => setViewMode('client')}
              className="px-5 py-2.5 text-xs font-semibold tracking-wide text-[#231C1A] bg-[#EFE8E2] rounded-lg hover:bg-[#E4DAD1] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Voltar ao Site Público
            </button>
          )}
        </div>
      </header>

      {/* Mobile Mode Switcher Bar (below header, non-sticky to respect 15% mobile sticky cap) */}
      <div className="md:hidden flex items-center justify-between px-6 py-3 bg-[#F3EDE8] border-b border-[#E6DCD5] text-xs font-medium text-[#6B5D57]">
        <div className="flex items-center gap-4">
          <a href="#servicos" onClick={() => setViewMode('client')}>
            Procedimentos
          </a>
          <span>·</span>
          <a href="#agendamento" onClick={() => setViewMode('client')}>
            Agendar
          </a>
          <span>·</span>
          <a href="#consultar" onClick={() => setViewMode('client')}>
            Protocolo
          </a>
        </div>
        <button
          type="button"
          onClick={() => setViewMode(viewMode === 'client' ? 'admin' : 'client')}
          className="text-[#9E5A63] font-semibold whitespace-nowrap shrink-0"
        >
          {viewMode === 'client' ? 'Painel Admin' : 'Ver Site'}
        </button>
      </div>

      {/* MAIN VIEWPORT */}
      {viewMode === 'client' ? (
        <main className="flex-1">
          {/* SECTION 1: HERO ATELIER SHOWCASE */}
          <section
            id="inicio"
            className="max-w-[1280px] mx-auto px-6 lg:px-12 pt-10 pb-14 lg:pt-16 lg:pb-20"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
              {/* Left Column: Editorial Narrative */}
              <div className="lg:col-span-7 flex flex-col justify-between py-2">
                <div>
                  <div className="flex items-center gap-2 text-xs text-[#6B5D57] mb-4">
                    <span>Nail Designer & Nail Art Autoral</span>
                    <span aria-hidden="true">·</span>
                    <span>@nails.marianacastro</span>
                    <span aria-hidden="true">·</span>
                    <span>Atendimento com Hora Marcada</span>
                  </div>

                  <h1
                    className="font-serif-display text-[#231C1A] font-semibold tracking-tight leading-[1.08] mb-6"
                    style={{
                      fontSize: 'clamp(2.35rem, 4.2vw, 3.85rem)',
                      textWrap: 'balance',
                    }}
                  >
                    Delicadeza escultural em fibra de vidro, francesa reversa e
                    arte encapsulada.
                  </h1>

                  <p className="text-[#6B5D57] text-base leading-relaxed max-w-[62ch] mb-8">
                    Cada atendimento no estúdio Mariana Castro é desenhado com
                    tempo dedicado para arquitetura resistente, acabamento fino
                    natural e cuticulagem de precisão. Escolha seu procedimento,
                    personalize o formato e reserve seu horário online em poucos
                    segundos.
                  </p>

                  <div className="flex flex-wrap items-center gap-4 mb-10">
                    <a
                      href="#agendamento"
                      className="px-6 py-3.5 text-sm font-semibold text-white bg-[#9E5A63] rounded-lg hover:bg-[#874952] transition-colors whitespace-nowrap shrink-0"
                    >
                      Reservar Meu Horário
                    </a>
                    <a
                      href="#servicos"
                      className="px-6 py-3.5 text-sm font-medium text-[#231C1A] border border-[#D8CBC2] rounded-lg hover:bg-[#F3EDE8] transition-colors whitespace-nowrap shrink-0"
                    >
                      Conhecer Procedimentos
                    </a>
                  </div>
                </div>

                {/* Proof & Studio Standards Strip */}
                <div className="pt-6 border-t border-[#E6DCD5] grid grid-cols-3 gap-6">
                  <div>
                    <p className="font-serif-display text-2xl lg:text-3xl font-semibold text-[#231C1A] tabular-nums">
                      +21 dias
                    </p>
                    <p className="text-xs text-[#6B5D57] mt-1">
                      Durabilidade média com brilho intacto
                    </p>
                  </div>
                  <div>
                    <p className="font-serif-display text-2xl lg:text-3xl font-semibold text-[#231C1A] tabular-nums">
                      100% Esterilizado
                    </p>
                    <p className="text-xs text-[#6B5D57] mt-1">
                      Biossegurança rigorosa em autoclave
                    </p>
                  </div>
                  <div>
                    <p className="font-serif-display text-2xl lg:text-3xl font-semibold text-[#231C1A] tabular-nums">
                      Individual
                    </p>
                    <p className="text-xs text-[#6B5D57] mt-1">
                      Café especial e atenção exclusiva
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Column: Editorial Hero Image */}
              <div className="lg:col-span-5">
                <div className="relative h-full min-h-[360px] rounded-xl overflow-hidden border border-[#E6DCD5] bg-[#F3EDE8]">
                  <ResilientImage
                    src={STUDIO_IMAGES.french_atelier}
                    alt="Alongamento Francesa Reversa por Mariana Castro"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-6 text-white">
                    <p className="text-xs text-white/80 mb-1">
                      Especialidade da Casa · Curvatura Fina
                    </p>
                    <p className="font-serif-display text-xl font-medium">
                      Francesa Reversa & Leito Nude Rosado
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 2: MENU DE PROCEDIMENTOS & PORTFÓLIO */}
          <section
            id="servicos"
            className="bg-[#F3EDE8] border-y border-[#E6DCD5] py-16 lg:py-20"
          >
            <div className="max-w-[1280px] mx-auto px-6 lg:px-12">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
                <div>
                  <p className="text-xs text-[#6B5D57] mb-2">
                    Catálogo de Serviços · Valores e Tempo Estimado
                  </p>
                  <h2
                    className="font-serif-display text-3xl lg:text-4xl font-semibold text-[#231C1A]"
                    style={{ textWrap: 'balance' }}
                  >
                    Procedimentos Assinados por Mariana Castro
                  </h2>
                </div>

                {/* Interactive Filter Controls (Functional Segmented Buttons) */}
                <div className="flex flex-wrap items-center gap-1 p-1 bg-[#E6DCD5]/70 rounded-lg">
                  {[
                    'Todos',
                    'Alongamento',
                    'Manutenção',
                    'Banho de Gel & Blindagem',
                  ].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        categoryFilter === cat
                          ? 'bg-[#FAF7F5] text-[#231C1A] shadow-xs'
                          : 'text-[#6B5D57] hover:text-[#231C1A]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3-Column Product/Service Grid */}
              <div
                id="portfolio"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
              >
                {filteredServices.map((service) => {
                  const isSelected = selectedService.id === service.id;
                  return (
                    <article
                      key={service.id}
                      className={`group flex flex-col bg-[#FAF7F5] rounded-xl overflow-hidden border transition-transform duration-150 hover:-translate-y-0.5 ${
                        isSelected
                          ? 'border-[#9E5A63]'
                          : 'border-[#E6DCD5]'
                      }`}
                    >
                      <div className="aspect-[4/3] w-full overflow-hidden bg-[#EFE8E2]">
                        <ResilientImage
                          src={
                            STUDIO_IMAGES[service.imageKey] ||
                            STUDIO_IMAGES.french_atelier
                          }
                          alt={service.name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-103"
                        />
                      </div>

                      <div className="p-6 flex-1 flex flex-col justify-between">
                        <div>
                          {/* Unboxed Clean Metadata */}
                          <div className="flex items-center gap-2 text-xs text-[#6B5D57] mb-2">
                            <span>{service.category}</span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums">
                              {formatDuration(service.durationMinutes)}
                            </span>
                          </div>

                          <h3 className="font-serif-display text-xl font-semibold text-[#231C1A] mb-2">
                            {service.name}
                          </h3>

                          <p className="text-sm text-[#6B5D57] leading-relaxed mb-6">
                            {service.description}
                          </p>
                        </div>

                        <div className="pt-4 border-t border-[#E6DCD5] flex items-center justify-between gap-4">
                          <div>
                            <span className="text-xs text-[#6B5D57] block">
                              Investimento
                            </span>
                            <span className="font-mono-tabular text-base font-semibold text-[#231C1A]">
                              {formatCurrencyBRL(service.priceCents)}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleChooseServiceCard(service)}
                            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                              isSelected
                                ? 'bg-[#231C1A] text-white'
                                : 'bg-[#9E5A63] text-white hover:bg-[#874952]'
                            }`}
                          >
                            {isSelected ? 'Selecionado' : 'Escolher Horário'}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>

          {/* SECTION 3: INTERACTIVE ONLINE BOOKING CONCIERGE & CONFIRMATION FLOW */}
          <section
            id="agendamento"
            className="max-w-[1280px] mx-auto px-6 lg:px-12 py-16 lg:py-24"
          >
            <div className="mb-10">
              <div className="flex items-center gap-2 text-xs text-[#6B5D57] mb-2">
                <span>Agenda Online em Tempo Real</span>
                <span aria-hidden="true">·</span>
                <span>Confirmação Imediata de Protocolo</span>
              </div>
              <h2
                className="font-serif-display text-3xl lg:text-4xl font-semibold text-[#231C1A]"
                style={{ textWrap: 'balance' }}
              >
                Reserve Seu Momento no Atelier
              </h2>
            </div>

            {bookingStep === 3 && confirmedReceipt ? (
              /* STEP 3: DELICATE EDITORIAL CONFIRMATION RECEIPT */
              <div className="max-w-3xl mx-auto bg-white border border-[#E6DCD5] rounded-xl p-8 lg:p-10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#E6DCD5]">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-[#2D6A4F] font-medium mb-1">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {confirmedReceipt.status === 'cancelled'
                          ? 'Agendamento Cancelado'
                          : 'Solicitação de Agendamento Registrada'}
                      </span>
                    </div>
                    <h3 className="font-serif-display text-2xl lg:text-3xl font-semibold text-[#231C1A]">
                      Comprovante de Agendamento — {confirmedReceipt.clientName}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono-tabular text-sm font-semibold text-[#231C1A] bg-[#F3EDE8] px-3 py-1.5 rounded-md border border-[#E6DCD5]">
                      {confirmedReceipt.protocolCode}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyProtocolToClipboard(confirmedReceipt.protocolCode)
                      }
                      className="px-3 py-1.5 text-xs font-medium text-[#6B5D57] hover:text-[#231C1A] border border-[#E6DCD5] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedProtocol ? 'Copiado' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-[#E6DCD5] text-sm">
                  <div>
                    <p className="text-xs text-[#6B5D57] mb-1">Procedimento</p>
                    <p className="font-medium text-[#231C1A]">
                      {confirmedReceipt.serviceName}
                    </p>
                    <p className="text-xs text-[#6B5D57] mt-1">
                      Formato {confirmedReceipt.nailShape} ·{' '}
                      {confirmedReceipt.nailFinish}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-[#6B5D57] mb-1">Data e Horário</p>
                    <p className="font-mono-tabular font-semibold text-[#231C1A]">
                      {formatDateBR(confirmedReceipt.date)} às{' '}
                      {confirmedReceipt.time}
                    </p>
                    <p className="text-xs text-[#6B5D57] mt-1">
                      Duração estimada:{' '}
                      {formatDuration(confirmedReceipt.durationMinutes)}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-[#6B5D57] mb-1">
                      Dados de Contato
                    </p>
                    <p className="font-medium text-[#231C1A]">
                      {confirmedReceipt.clientPhone} ·{' '}
                      {confirmedReceipt.clientInstagram}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-[#6B5D57] mb-1">
                      Valor Estimado & Status
                    </p>
                    <p className="font-mono-tabular font-semibold text-[#231C1A]">
                      {formatCurrencyBRL(confirmedReceipt.priceCents)} ·{' '}
                      {confirmedReceipt.status === 'pending'
                        ? 'Aguardando Confirmação da Mariana'
                        : confirmedReceipt.status === 'confirmed'
                        ? 'Confirmado'
                        : 'Cancelado'}
                    </p>
                  </div>
                </div>

                <div className="py-5 text-xs text-[#6B5D57] space-y-2">
                  <p className="font-semibold text-[#231C1A]">
                    Orientações para o seu atendimento no estúdio:
                  </p>
                  <p>
                    1. Guarde seu protocolo{' '}
                    <strong className="font-mono-tabular text-[#231C1A]">
                      {confirmedReceipt.protocolCode}
                    </strong>{' '}
                    para consultar o status de confirmação ou reagendar.
                  </p>
                  <p>
                    2. Tolerância de atraso de 15 minutos para não comprometer a
                    simetria e o acabamento do seu procedimento.
                  </p>
                </div>

                <div className="pt-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setBookingStep(1);
                        setConfirmedReceipt(null);
                        setClientNotes('');
                      }}
                      className="px-5 py-2.5 text-xs font-semibold text-white bg-[#9E5A63] rounded-lg hover:bg-[#874952] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Fazer Outro Agendamento
                    </button>

                    {confirmedReceipt.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() =>
                          handleClientCancelAppointment(confirmedReceipt)
                        }
                        className="px-4 py-2.5 text-xs font-medium text-[#B91C1C] border border-[#F5C2C7] rounded-lg hover:bg-[#FFF5F5] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Cancelar Solicitação
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setViewMode('admin')}
                    className="text-xs font-medium text-[#6B5D57] hover:text-[#231C1A] underline cursor-pointer"
                  >
                    Ver no Painel Administrativo →
                  </button>
                </div>
              </div>
            ) : (
              /* STEPS 1 & 2: CONTIGUOUS BOOKING MODULE */
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                {/* Left 8 Columns: Interactive Configurator */}
                <div className="lg:col-span-8 bg-white border border-[#E6DCD5] rounded-xl p-6 lg:p-8 space-y-8">
                  {/* Step Switcher Header */}
                  <div className="flex items-center justify-between pb-4 border-b border-[#E6DCD5]">
                    <div className="flex items-center gap-4 text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => setBookingStep(1)}
                        className={`flex items-center gap-2 cursor-pointer ${
                          bookingStep === 1
                            ? 'text-[#9E5A63] font-semibold'
                            : 'text-[#6B5D57]'
                        }`}
                      >
                        <span className="font-mono-tabular">01.</span>
                        <span>Procedimento, Formato & Horário</span>
                      </button>
                      <ChevronRight className="w-4 h-4 text-[#D8CBC2]" />
                      <button
                        type="button"
                        onClick={() => setBookingStep(2)}
                        className={`flex items-center gap-2 cursor-pointer ${
                          bookingStep === 2
                            ? 'text-[#9E5A63] font-semibold'
                            : 'text-[#6B5D57]'
                        }`}
                      >
                        <span className="font-mono-tabular">02.</span>
                        <span>Seus Dados & Confirmação</span>
                      </button>
                    </div>
                    <span className="text-xs text-[#6B5D57] hidden sm:inline">
                      Etapa {bookingStep} de 2
                    </span>
                  </div>

                  {bookingStep === 1 ? (
                    <div className="space-y-8">
                      {/* 1. Choose Procedure */}
                      <div>
                        <label className="block text-xs font-semibold text-[#231C1A] mb-3">
                          01. Escolha o Procedimento
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {servicesCatalog.map((svc) => {
                            const active = svc.id === selectedService.id;
                            return (
                              <button
                                key={svc.id}
                                type="button"
                                onClick={() => setSelectedServiceId(svc.id)}
                                className={`text-left p-4 rounded-lg border transition-colors cursor-pointer ${
                                  active
                                    ? 'border-[#9E5A63] bg-[#FAF5F6]'
                                    : 'border-[#E6DCD5] hover:bg-[#FAF7F5]'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span className="font-medium text-sm text-[#231C1A]">
                                    {svc.name}
                                  </span>
                                  {active && (
                                    <Check className="w-4 h-4 text-[#9E5A63] shrink-0 mt-0.5" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-[#6B5D57] mt-2 font-mono-tabular">
                                  <span>{formatCurrencyBRL(svc.priceCents)}</span>
                                  <span>·</span>
                                  <span>{formatDuration(svc.durationMinutes)}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 2. Choose Nail Shape & Finish */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-[#E6DCD5]">
                        <div>
                          <label className="block text-xs font-semibold text-[#231C1A] mb-3">
                            02. Formato Desejado
                          </label>
                          <div className="flex flex-wrap gap-2">
                            {NAIL_SHAPES.map((shape) => (
                              <button
                                key={shape}
                                type="button"
                                onClick={() => setSelectedNailShape(shape)}
                                className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                  selectedNailShape === shape
                                    ? 'border-[#9E5A63] bg-[#9E5A63] text-white'
                                    : 'border-[#E6DCD5] text-[#231C1A] hover:bg-[#FAF7F5]'
                                }`}
                              >
                                {shape}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-[#231C1A] mb-3">
                            03. Acabamento / Arte Principal
                          </label>
                          <select
                            value={selectedNailFinish}
                            onChange={(e) =>
                              setSelectedNailFinish(e.target.value as NailFinish)
                            }
                            className="w-full px-3.5 py-2.5 text-xs font-medium text-[#231C1A] bg-[#FAF7F5] border border-[#E6DCD5] rounded-lg focus:outline-none focus:border-[#9E5A63]"
                          >
                            {NAIL_FINISHES.map((finish) => (
                              <option key={finish} value={finish}>
                                {finish}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* 3. Choose Date */}
                      <div className="pt-4 border-t border-[#E6DCD5]">
                        <label className="block text-xs font-semibold text-[#231C1A] mb-3">
                          04. Selecione o Dia (Seg a Sáb)
                        </label>
                        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                          {availableDays.map((d) => {
                            const isSelected = d.iso === selectedDate;
                            return (
                              <button
                                key={d.iso}
                                type="button"
                                disabled={d.isSunday}
                                onClick={() => setSelectedDate(d.iso)}
                                className={`p-2.5 rounded-lg border text-center transition-colors cursor-pointer ${
                                  d.isSunday
                                    ? 'opacity-40 cursor-not-allowed border-[#E6DCD5] bg-[#F3EDE8]'
                                    : isSelected
                                    ? 'border-[#9E5A63] bg-[#9E5A63] text-white'
                                    : 'border-[#E6DCD5] hover:bg-[#FAF7F5] text-[#231C1A]'
                                }`}
                              >
                                <span
                                  className={`block text-[11px] ${
                                    isSelected ? 'text-white/85' : 'text-[#6B5D57]'
                                  }`}
                                >
                                  {d.weekdayShort}
                                </span>
                                <span className="font-mono-tabular text-base font-semibold block my-0.5">
                                  {d.dayNumber}
                                </span>
                                <span
                                  className={`block text-[10px] ${
                                    isSelected ? 'text-white/85' : 'text-[#6B5D57]'
                                  }`}
                                >
                                  {d.monthShort}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 4. Choose Time Slot */}
                      <div className="pt-4 border-t border-[#E6DCD5]">
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-xs font-semibold text-[#231C1A]">
                            05. Horários Disponíveis em{' '}
                            <span className="font-mono-tabular">
                              {formatDateBR(selectedDate)}
                            </span>
                          </label>
                          {slotsLoading && (
                            <span className="text-xs text-[#6B5D57]">
                              Atualizando agenda...
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
                          {STUDIO_HOURS.map((hour) => {
                            const occupied = occupiedTimesForSelectedDate.get(hour);
                            const isSelected =
                              selectedTime === hour && !occupied;

                            return (
                              <button
                                key={hour}
                                type="button"
                                disabled={Boolean(occupied)}
                                onClick={() => setSelectedTime(hour)}
                                className={`py-2.5 px-3 rounded-lg border font-mono-tabular text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                                  occupied
                                    ? 'border-[#E6DCD5] bg-[#F3EDE8] text-[#A89B94] line-through cursor-not-allowed'
                                    : isSelected
                                    ? 'border-[#9E5A63] bg-[#9E5A63] text-white font-semibold cursor-pointer'
                                    : 'border-[#E6DCD5] text-[#231C1A] hover:bg-[#FAF7F5] cursor-pointer'
                                }`}
                              >
                                {hour}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="pt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={() => setBookingStep(2)}
                          className="px-6 py-3 text-xs font-semibold text-white bg-[#9E5A63] rounded-lg hover:bg-[#874952] transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-2"
                        >
                          <span>Continuar para Identificação</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* STEP 2: CLIENT IDENTIFICATION FORM */
                    <form onSubmit={handleCreateAppointment} className="space-y-5">
                      {bookingFormError && (
                        <div className="p-3.5 rounded-lg bg-[#FFF5F5] border border-[#F5C2C7] text-xs text-[#B91C1C] flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{bookingFormError}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-[#231C1A] mb-1.5">
                            Nome Completo *
                          </label>
                          <input
                            type="text"
                            required
                            maxLength={80}
                            placeholder="Ex: Carolina Mendes"
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                            className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F5] border border-[#E6DCD5] rounded-lg focus:outline-none focus:border-[#9E5A63]"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-[#231C1A] mb-1.5">
                            WhatsApp com DDD *
                          </label>
                          <input
                            type="tel"
                            required
                            maxLength={25}
                            placeholder="Ex: (11) 99876-5432"
                            value={clientPhone}
                            onChange={(e) => setClientPhone(e.target.value)}
                            className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F5] border border-[#E6DCD5] rounded-lg focus:outline-none focus:border-[#9E5A63] font-mono-tabular"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[#231C1A] mb-1.5">
                          Seu @ do Instagram (opcional, para referência de inspirações)
                        </label>
                        <input
                          type="text"
                          maxLength={50}
                          placeholder="Ex: @carolinamendes"
                          value={clientInstagram}
                          onChange={(e) => setClientInstagram(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F5] border border-[#E6DCD5] rounded-lg focus:outline-none focus:border-[#9E5A63]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[#231C1A] mb-1.5">
                          Observações (Ex: precisa de remoção, unha quebrada ou inspiração específica)
                        </label>
                        <textarea
                          rows={3}
                          maxLength={250}
                          placeholder="Conte para a Mariana se possui alongamento antigo ou preferência de detalhe..."
                          value={clientNotes}
                          onChange={(e) => setClientNotes(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F5] border border-[#E6DCD5] rounded-lg focus:outline-none focus:border-[#9E5A63]"
                        />
                      </div>

                      <div className="pt-4 border-t border-[#E6DCD5] flex items-center justify-between gap-4">
                        <button
                          type="button"
                          onClick={() => setBookingStep(1)}
                          className="px-4 py-2.5 text-xs font-medium text-[#6B5D57] hover:text-[#231C1A] border border-[#E6DCD5] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          ← Voltar ao Horário
                        </button>

                        <button
                          type="submit"
                          disabled={submittingBooking}
                          className="px-6 py-3 text-xs font-semibold text-white bg-[#9E5A63] rounded-lg hover:bg-[#874952] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {submittingBooking
                            ? 'Confirmando Reserva...'
                            : 'Confirmar Agendamento Online'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Right 4 Columns: Contiguous Booking Summary Card */}
                <aside className="lg:col-span-4 bg-[#F3EDE8] border border-[#E6DCD5] rounded-xl p-6 lg:sticky lg:top-24">
                  <p className="text-xs text-[#6B5D57] mb-1">
                    Resumo da Sua Reserva
                  </p>
                  <h3 className="font-serif-display text-2xl font-semibold text-[#231C1A] pb-4 border-b border-[#E6DCD5]">
                    nails.marianacastro
                  </h3>

                  <div className="py-5 space-y-4 text-sm border-b border-[#E6DCD5]">
                    <div>
                      <span className="text-xs text-[#6B5D57] block">
                        Procedimento Selecionado
                      </span>
                      <span className="font-medium text-[#231C1A]">
                        {selectedService.name}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#6B5D57]">Formato & Arte</span>
                      <span className="font-medium text-[#231C1A]">
                        {selectedNailShape} · {selectedNailFinish}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#6B5D57]">Data & Horário</span>
                      <span className="font-mono-tabular font-semibold text-[#231C1A]">
                        {formatDateBR(selectedDate)} às {selectedTime}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#6B5D57]">Duração Estimada</span>
                      <span className="font-mono-tabular text-[#231C1A]">
                        {formatDuration(selectedService.durationMinutes)}
                      </span>
                    </div>
                  </div>

                  <div className="py-4 flex items-baseline justify-between">
                    <span className="text-xs font-medium text-[#6B5D57]">
                      Total Estimado
                    </span>
                    <span className="font-mono-tabular text-xl font-semibold text-[#231C1A]">
                      {formatCurrencyBRL(selectedService.priceCents)}
                    </span>
                  </div>

                  <p className="text-[11px] text-[#6B5D57] leading-relaxed">
                    O pagamento é realizado diretamente no estúdio (PIX, cartão
                    ou espécie) ao término do procedimento.
                  </p>
                </aside>
              </div>
            )}
          </section>

          {/* SECTION 4: CONSULTAR PROTOCOLO DE AGENDAMENTO */}
          <section
            id="consultar"
            className="bg-[#F3EDE8] border-t border-[#E6DCD5] py-16"
          >
            <div className="max-w-[1280px] mx-auto px-6 lg:px-12">
              <div className="max-w-2xl mx-auto bg-[#FAF7F5] border border-[#E6DCD5] rounded-xl p-6 lg:p-8">
                <div className="flex items-center gap-2 text-xs text-[#6B5D57] mb-1">
                  <FileText className="w-3.5 h-3.5 text-[#9E5A63]" />
                  <span>Acompanhamento de Reserva</span>
                </div>
                <h2 className="font-serif-display text-2xl font-semibold text-[#231C1A] mb-2">
                  Consultar ou Gerenciar Meu Horário
                </h2>
                <p className="text-xs text-[#6B5D57] mb-5">
                  Digite o código de protocolo gerado no seu comprovante (Ex:{' '}
                  <span className="font-mono-tabular">MC-8F4K2A</span>) para
                  verificar o status de confirmação.
                </p>

                <form
                  onSubmit={handleLookupProtocol}
                  className="flex flex-col sm:flex-row gap-3"
                >
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="Código do protocolo (Ex: MC-8F4K2A)"
                    value={lookupInput}
                    onChange={(e) => setLookupInput(e.target.value.toUpperCase())}
                    className="flex-1 px-3.5 py-2.5 text-sm font-mono-tabular bg-white border border-[#E6DCD5] rounded-lg focus:outline-none focus:border-[#9E5A63]"
                  />
                  <button
                    type="submit"
                    disabled={lookupLoading}
                    className="px-5 py-2.5 text-xs font-semibold text-white bg-[#231C1A] rounded-lg hover:bg-[#3A2F2C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {lookupLoading ? 'Buscando...' : 'Consultar Protocolo'}
                  </button>
                </form>

                {lookupError && (
                  <p className="text-xs text-[#B91C1C] mt-3">{lookupError}</p>
                )}

                {lookupResult && (
                  <div className="mt-6 pt-5 border-t border-[#E6DCD5] flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-sm">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-[#6B5D57]">
                        <span className="font-mono-tabular font-semibold text-[#231C1A]">
                          {lookupResult.protocolCode}
                        </span>
                        <span>·</span>
                        <span>{lookupResult.clientName}</span>
                      </div>
                      <p className="font-medium text-[#231C1A] mt-1">
                        {lookupResult.serviceName}
                      </p>
                      <p className="text-xs text-[#6B5D57] font-mono-tabular mt-0.5">
                        {formatDateBR(lookupResult.date)} às {lookupResult.time}{' '}
                        ·{' '}
                        {lookupResult.status === 'pending'
                          ? 'Aguardando Confirmação'
                          : lookupResult.status === 'confirmed'
                          ? 'Horário Confirmado'
                          : lookupResult.status === 'completed'
                          ? 'Atendimento Concluído'
                          : 'Cancelado'}
                      </p>
                    </div>

                    {lookupResult.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => handleClientCancelAppointment(lookupResult)}
                        className="px-3.5 py-2 text-xs font-medium text-[#B91C1C] border border-[#F5C2C7] rounded-lg hover:bg-[#FFF5F5] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Cancelar Reserva
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        </main>
      ) : (
        /* =====================================================================
           ADMINISTRATION PANEL (PAINEL DELICADO E ELEGANTE — MARIANA CASTRO)
           ===================================================================== */
        <main className="flex-1 max-w-[1280px] w-full mx-auto px-6 lg:px-12 py-10">
          {!isAdminUser ? (
            /* Admin Login Gate */
            <div className="max-w-md mx-auto bg-white border border-[#E6DCD5] rounded-xl p-8 text-center my-12">
              <div className="w-10 h-10 rounded-full bg-[#F3EDE8] text-[#9E5A63] flex items-center justify-center mx-auto mb-4">
                <Lock className="w-5 h-5" />
              </div>
              <h2 className="font-serif-display text-2xl font-semibold text-[#231C1A] mb-2">
                Painel Administrativo — Mariana Castro
              </h2>
              <p className="text-xs text-[#6B5D57] leading-relaxed mb-6">
                Acesso exclusivo para gerenciamento de agenda, confirmação de
                clientes, bloqueio de horários e catálogo de procedimentos do
                estúdio.
              </p>

              {authError && (
                <div className="p-3 mb-4 rounded-lg bg-[#FFF5F5] border border-[#F5C2C7] text-xs text-[#B91C1C]">
                  {authError}
                </div>
              )}

              {currentUser && !isAdminUser ? (
                <div className="space-y-4">
                  <p className="text-xs text-[#B91C1C]">
                    A conta conectada ({currentUser.email}) não possui permissão
                    de administradora do estúdio.
                  </p>
                  <button
                    type="button"
                    onClick={() => signOut(auth)}
                    className="w-full py-2.5 px-4 text-xs font-semibold text-[#231C1A] border border-[#E6DCD5] rounded-lg hover:bg-[#FAF7F5] cursor-pointer"
                  >
                    Trocar de Conta
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="w-full py-3 px-5 text-xs font-semibold text-white bg-[#9E5A63] rounded-lg hover:bg-[#874952] transition-colors cursor-pointer"
                >
                  Entrar com Google (Administradora)
                </button>
              )}
            </div>
          ) : (
            /* Authenticated Admin Workspace */
            <div className="space-y-8">
              {/* Top Workspace Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#E6DCD5]">
                <div>
                  <div className="flex items-center gap-2 text-xs text-[#6B5D57] mb-1">
                    <span>Gestão do Atelier</span>
                    <span>·</span>
                    <span>{currentUser?.email}</span>
                  </div>
                  <h1 className="font-serif-display text-3xl font-semibold text-[#231C1A]">
                    Painel de Agendamentos &Disponibilidade
                  </h1>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Segmented Admin Navigation */}
                  <div className="flex items-center gap-1 p-1 bg-[#EFE8E2] rounded-lg">
                    <button
                      type="button"
                      onClick={() => setAdminTab('agenda')}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        adminTab === 'agenda'
                          ? 'bg-white text-[#231C1A] shadow-xs'
                          : 'text-[#6B5D57] hover:text-[#231C1A]'
                      }`}
                    >
                      Agenda de Clientes
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdminTab('horarios')}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        adminTab === 'horarios'
                          ? 'bg-white text-[#231C1A] shadow-xs'
                          : 'text-[#6B5D57] hover:text-[#231C1A]'
                      }`}
                    >
                      Bloqueio de Horários
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdminTab('servicos')}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        adminTab === 'servicos'
                          ? 'bg-white text-[#231C1A] shadow-xs'
                          : 'text-[#6B5D57] hover:text-[#231C1A]'
                      }`}
                    >
                      Catálogo ({servicesCatalog.length})
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => signOut(auth)}
                    className="px-3.5 py-2 text-xs font-medium text-[#6B5D57] hover:text-[#231C1A] border border-[#E6DCD5] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sair</span>
                  </button>
                </div>
              </div>

              {/* KPI Strip (Single-elevation flat cards with tabular-nums) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-[#E6DCD5] rounded-xl p-5">
                  <span className="text-xs text-[#6B5D57] block">
                    Aguardando Confirmação
                  </span>
                  <span className="font-mono-tabular text-2xl font-semibold text-[#B45309] mt-1 block">
                    {adminMetrics.pendingCount}
                  </span>
                </div>

                <div className="bg-white border border-[#E6DCD5] rounded-xl p-5">
                  <span className="text-xs text-[#6B5D57] block">
                    Horários Confirmados
                  </span>
                  <span className="font-mono-tabular text-2xl font-semibold text-[#15803D] mt-1 block">
                    {adminMetrics.confirmedCount}
                  </span>
                </div>

                <div className="bg-white border border-[#E6DCD5] rounded-xl p-5">
                  <span className="text-xs text-[#6B5D57] block">
                    Atendimentos Concluídos
                  </span>
                  <span className="font-mono-tabular text-2xl font-semibold text-[#231C1A] mt-1 block">
                    {adminMetrics.completedCount}
                  </span>
                </div>

                <div className="bg-white border border-[#E6DCD5] rounded-xl p-5">
                  <span className="text-xs text-[#6B5D57] block">
                    Receita Prevista (Confirmados)
                  </span>
                  <span className="font-mono-tabular text-2xl font-semibold text-[#231C1A] mt-1 block">
                    {formatCurrencyBRL(adminMetrics.expectedRevenueCents)}
                  </span>
                </div>
              </div>

              {/* TAB 1: AGENDA DE CLIENTES */}
              {adminTab === 'agenda' && (
                <div className="bg-white border border-[#E6DCD5] rounded-xl overflow-hidden">
                  {/* Filter Bar */}
                  <div className="p-5 border-b border-[#E6DCD5] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { id: 'todos', label: 'Todos' },
                        { id: 'pending', label: 'Pendentes' },
                        { id: 'confirmed', label: 'Confirmados' },
                        { id: 'completed', label: 'Concluídos' },
                        { id: 'cancelled', label: 'Cancelados' },
                      ].map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setAdminStatusFilter(st.id)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            adminStatusFilter === st.id
                              ? 'bg-[#9E5A63] text-white'
                              : 'bg-[#FAF7F5] text-[#6B5D57] hover:text-[#231C1A]'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="date"
                        value={adminDateFilter}
                        onChange={(e) => setAdminDateFilter(e.target.value)}
                        className="px-3 py-1.5 text-xs font-mono-tabular bg-[#FAF7F5] border border-[#E6DCD5] rounded-lg focus:outline-none focus:border-[#9E5A63]"
                      />
                      {adminDateFilter && (
                        <button
                          type="button"
                          onClick={() => setAdminDateFilter('')}
                          className="text-xs text-[#6B5D57] hover:text-[#231C1A] cursor-pointer"
                        >
                          Limpar data
                        </button>
                      )}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-[#6B5D57] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Buscar cliente ou protocolo..."
                          value={adminSearch}
                          onChange={(e) => setAdminSearch(e.target.value)}
                          className="pl-8 pr-3 py-1.5 text-xs bg-[#FAF7F5] border border-[#E6DCD5] rounded-lg focus:outline-none focus:border-[#9E5A63]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Appointments High-Density Table */}
                  {adminLoading ? (
                    <div className="p-12 text-center text-sm text-[#6B5D57]">
                      Carregando agendamentos do estúdio...
                    </div>
                  ) : filteredAdminAppointments.length === 0 ? (
                    <div className="p-12 text-center">
                      <p className="font-serif-display text-xl text-[#231C1A] mb-1">
                        Nenhum agendamento encontrado para este filtro
                      </p>
                      <p className="text-xs text-[#6B5D57] mb-4">
                        Assim que as clientes reservarem horário na página
                        pública, os pedidos aparecerão aqui em tempo real.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#E6DCD5] bg-[#FAF7F5] text-[11px] font-semibold text-[#6B5D57]">
                            <th className="py-3 px-4">Data & Hora</th>
                            <th className="py-3 px-4">Protocolo</th>
                            <th className="py-3 px-4">Cliente & Contato</th>
                            <th className="py-3 px-4">Procedimento & Detalhes</th>
                            <th className="py-3 px-4 text-right">Valor</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4 text-right">Ações Rápidas</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E6DCD5] text-xs">
                          {filteredAdminAppointments.map((appt) => (
                            <tr
                              key={appt.id}
                              className="hover:bg-[#FAF7F5]/80 transition-colors"
                            >
                              <td className="py-3.5 px-4 font-mono-tabular whitespace-nowrap">
                                <span className="font-semibold text-[#231C1A] block">
                                  {formatDateBR(appt.date)}
                                </span>
                                <span className="text-[#6B5D57]">
                                  {appt.time} ({formatDuration(appt.durationMinutes)})
                                </span>
                              </td>

                              <td className="py-3.5 px-4 font-mono-tabular font-medium text-[#231C1A] whitespace-nowrap">
                                {appt.protocolCode}
                              </td>

                              <td className="py-3.5 px-4">
                                <span className="font-semibold text-[#231C1A] block">
                                  {appt.clientName}
                                </span>
                                <span className="text-[#6B5D57] font-mono-tabular">
                                  {appt.clientPhone} · {appt.clientInstagram}
                                </span>
                              </td>

                              <td className="py-3.5 px-4 max-w-xs">
                                <span className="font-medium text-[#231C1A] block truncate">
                                  {appt.serviceName}
                                </span>
                                <span className="text-[#6B5D57] block truncate">
                                  {appt.nailShape} · {appt.nailFinish}
                                </span>
                                {appt.notes && (
                                  <span className="text-[11px] text-[#8C7A72] italic block truncate mt-0.5">
                                    "{appt.notes}"
                                  </span>
                                )}
                              </td>

                              <td className="py-3.5 px-4 text-right font-mono-tabular font-semibold text-[#231C1A] whitespace-nowrap">
                                {formatCurrencyBRL(appt.priceCents)}
                              </td>

                              <td className="py-3.5 px-4 whitespace-nowrap">
                                {appt.status === 'pending' && (
                                  <span className="text-[#B45309] font-medium flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" />
                                    Pendente
                                  </span>
                                )}
                                {appt.status === 'confirmed' && (
                                  <span className="text-[#15803D] font-medium flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Confirmado
                                  </span>
                                )}
                                {appt.status === 'completed' && (
                                  <span className="text-[#231C1A] font-medium flex items-center gap-1">
                                    <Check className="w-3.5 h-3.5" />
                                    Concluído
                                  </span>
                                )}
                                {appt.status === 'cancelled' && (
                                  <span className="text-[#B91C1C] font-medium flex items-center gap-1">
                                    <XCircle className="w-3.5 h-3.5" />
                                    Cancelado
                                  </span>
                                )}
                              </td>

                              <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5">
                                  {appt.status === 'pending' && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleAdminStatusChange(appt, 'confirmed')
                                      }
                                      className="px-2.5 py-1 text-[11px] font-semibold text-white bg-[#15803D] rounded hover:bg-[#166534] transition-colors cursor-pointer"
                                    >
                                      Confirmar
                                    </button>
                                  )}
                                  {appt.status === 'confirmed' && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleAdminStatusChange(appt, 'completed')
                                      }
                                      className="px-2.5 py-1 text-[11px] font-semibold text-white bg-[#231C1A] rounded hover:bg-[#3A2F2C] transition-colors cursor-pointer"
                                    >
                                      Concluir
                                    </button>
                                  )}
                                  {appt.status !== 'cancelled' && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleAdminStatusChange(appt, 'cancelled')
                                      }
                                      className="px-2.5 py-1 text-[11px] font-medium text-[#B91C1C] border border-[#F5C2C7] rounded hover:bg-[#FFF5F5] transition-colors cursor-pointer"
                                    >
                                      Cancelar
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: BLOQUEIO DE HORÁRIOS */}
              {adminTab === 'horarios' && (
                <div className="bg-white border border-[#E6DCD5] rounded-xl p-6 lg:p-8 space-y-6">
                  <div>
                    <h2 className="font-serif-display text-2xl font-semibold text-[#231C1A]">
                      Gerenciar Disponibilidade de Horários
                    </h2>
                    <p className="text-xs text-[#6B5D57] mt-1">
                      Selecione uma data para bloquear horários de folga ou
                      liberar horários na agenda pública.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-xs font-semibold text-[#231C1A]">
                      Data Selecionada:
                    </label>
                    <input
                      type="date"
                      value={blockDate}
                      onChange={(e) => setBlockDate(e.target.value)}
                      className="px-3.5 py-2 text-xs font-mono-tabular bg-[#FAF7F5] border border-[#E6DCD5] rounded-lg"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                    {STUDIO_HOURS.map((hour) => {
                      const slot = bookedSlots.find(
                        (s) =>
                          s.date === blockDate &&
                          s.time === hour &&
                          s.status !== 'cancelled'
                      );
                      const isBlocked = slot?.status === 'blocked';
                      const isClientBooked =
                        slot?.status === 'pending' ||
                        slot?.status === 'confirmed';

                      return (
                        <div
                          key={hour}
                          className="p-4 rounded-xl border border-[#E6DCD5] bg-[#FAF7F5] flex flex-col justify-between gap-3"
                        >
                          <div>
                            <span className="font-mono-tabular text-base font-semibold text-[#231C1A] block">
                              {hour}
                            </span>
                            <span className="text-[11px] text-[#6B5D57] block mt-0.5">
                              {isClientBooked
                                ? 'Reservado por Cliente'
                                : isBlocked
                                ? 'Bloqueado pelo Estúdio'
                                : 'Livre para Agendar'}
                            </span>
                          </div>

                          {!isClientBooked && (
                            <button
                              type="button"
                              disabled={blockingSlot}
                              onClick={() =>
                                handleAdminToggleBlockSlot(blockDate, hour)
                              }
                              className={`w-full py-1.5 px-2.5 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                                isBlocked
                                  ? 'bg-[#231C1A] text-white hover:bg-[#3A2F2C]'
                                  : 'bg-white border border-[#E6DCD5] text-[#231C1A] hover:bg-[#EFE8E2]'
                              }`}
                            >
                              {isBlocked ? 'Liberar Horário' : 'Bloquear'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 3: CATÁLOGO DE PROCEDIMENTOS */}
              {adminTab === 'servicos' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-serif-display text-2xl font-semibold text-[#231C1A]">
                        Catálogo de Procedimentos e Valores
                      </h2>
                      <p className="text-xs text-[#6B5D57]">
                        Adicione novos procedimentos ao menu público do estúdio.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowNewServiceModal(true)}
                      className="px-4 py-2.5 text-xs font-semibold text-white bg-[#9E5A63] rounded-lg hover:bg-[#874952] transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Novo Procedimento</span>
                    </button>
                  </div>

                  {showNewServiceModal && (
                    <form
                      onSubmit={handleAdminCreateService}
                      className="bg-white border border-[#E6DCD5] rounded-xl p-6 space-y-4"
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-[#E6DCD5]">
                        <h3 className="font-serif-display text-xl font-semibold text-[#231C1A]">
                          Cadastrar Procedimento no Catálogo
                        </h3>
                        <button
                          type="button"
                          onClick={() => setShowNewServiceModal(false)}
                          className="text-[#6B5D57] hover:text-[#231C1A] cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-medium mb-1">
                            Nome do Procedimento *
                          </label>
                          <input
                            type="text"
                            required
                            maxLength={80}
                            value={newSvcName}
                            onChange={(e) => setNewSvcName(e.target.value)}
                            placeholder="Ex: Manutenção Fibra + Francesa"
                            className="w-full px-3 py-2 text-xs bg-[#FAF7F5] border border-[#E6DCD5] rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium mb-1">
                            Categoria
                          </label>
                          <select
                            value={newSvcCategory}
                            onChange={(e) =>
                              setNewSvcCategory(e.target.value as ServiceCategory)
                            }
                            className="w-full px-3 py-2 text-xs bg-[#FAF7F5] border border-[#E6DCD5] rounded-lg"
                          >
                            <option value="Alongamento">Alongamento</option>
                            <option value="Manutenção">Manutenção</option>
                            <option value="Banho de Gel & Blindagem">
                              Banho de Gel & Blindagem
                            </option>
                            <option value="Nail Art & Spa">Nail Art & Spa</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium mb-1">
                            Foto de Capa
                          </label>
                          <select
                            value={newSvcImageKey}
                            onChange={(e) => setNewSvcImageKey(e.target.value)}
                            className="w-full px-3 py-2 text-xs bg-[#FAF7F5] border border-[#E6DCD5] rounded-lg"
                          >
                            <option value="french_atelier">
                              Francesa Reversa Clássica
                            </option>
                            <option value="encapsulated_flowers">
                              Encapsulada com Flores & Ouro
                            </option>
                            <option value="chrome_cat_eye">
                              Cat-Eye Magnético Prata
                            </option>
                            <option value="baby_boomer_glitter">
                              Baby Boomer & Glitter Rose
                            </option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium mb-1">
                            Valor em Reais (R$) *
                          </label>
                          <input
                            type="number"
                            required
                            min={10}
                            max={5000}
                            value={newSvcPriceBRL}
                            onChange={(e) => setNewSvcPriceBRL(e.target.value)}
                            className="w-full px-3 py-2 text-xs font-mono-tabular bg-[#FAF7F5] border border-[#E6DCD5] rounded-lg"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium mb-1">
                            Duração em Minutos *
                          </label>
                          <input
                            type="number"
                            required
                            min={15}
                            max={360}
                            step={15}
                            value={newSvcDuration}
                            onChange={(e) =>
                              setNewSvcDuration(Number(e.target.value))
                            }
                            className="w-full px-3 py-2 text-xs font-mono-tabular bg-[#FAF7F5] border border-[#E6DCD5] rounded-lg"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-1">
                          Descrição Técnica *
                        </label>
                        <textarea
                          rows={2}
                          required
                          maxLength={300}
                          value={newSvcDesc}
                          onChange={(e) => setNewSvcDesc(e.target.value)}
                          placeholder="Descreva os detalhes e cuidados incluídos..."
                          className="w-full px-3 py-2 text-xs bg-[#FAF7F5] border border-[#E6DCD5] rounded-lg"
                        />
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowNewServiceModal(false)}
                          className="px-4 py-2 text-xs text-[#6B5D57] border border-[#E6DCD5] rounded-lg cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={savingService}
                          className="px-5 py-2 text-xs font-semibold text-white bg-[#9E5A63] rounded-lg cursor-pointer"
                        >
                          {savingService ? 'Salvando...' : 'Salvar Procedimento'}
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="bg-white border border-[#E6DCD5] rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#E6DCD5] bg-[#FAF7F5] text-[11px] font-semibold text-[#6B5D57]">
                          <th className="py-3 px-4">Procedimento</th>
                          <th className="py-3 px-4">Categoria</th>
                          <th className="py-3 px-4 text-right">Duração</th>
                          <th className="py-3 px-4 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E6DCD5] text-xs">
                        {servicesCatalog.map((s) => (
                          <tr key={s.id} className="hover:bg-[#FAF7F5]">
                            <td className="py-3.5 px-4">
                              <span className="font-semibold text-[#231C1A] block">
                                {s.name}
                              </span>
                              <span className="text-[#6B5D57]">{s.description}</span>
                            </td>
                            <td className="py-3.5 px-4 text-[#6B5D57] whitespace-nowrap">
                              {s.category}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono-tabular whitespace-nowrap">
                              {formatDuration(s.durationMinutes)}
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono-tabular font-semibold text-[#231C1A] whitespace-nowrap">
                              {formatCurrencyBRL(s.priceCents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      )}

      {/* QUIET EDITORIAL FOOTER */}
      <footer className="bg-[#FAF7F5] border-t border-[#E6DCD5] py-10">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-12 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#6B5D57]">
          <div className="flex items-center gap-3">
            <span className="font-serif-display text-lg font-semibold text-[#231C1A]">
              nails.marianacastro
            </span>
            <span>·</span>
            <span>Atelier de Alongamento em Gel & Nail Art</span>
          </div>

          <div className="flex items-center gap-6">
            <a
              href="#servicos"
              onClick={() => setViewMode('client')}
              className="hover:text-[#231C1A] transition-colors"
            >
              Procedimentos
            </a>
            <a
              href="#agendamento"
              onClick={() => setViewMode('client')}
              className="hover:text-[#231C1A] transition-colors"
            >
              Agendar Online
            </a>
            <button
              type="button"
              onClick={() =>
                setViewMode(viewMode === 'client' ? 'admin' : 'client')
              }
              className="hover:text-[#231C1A] transition-colors cursor-pointer"
            >
              {viewMode === 'client' ? 'Acesso Mariana Castro' : 'Página Pública'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
