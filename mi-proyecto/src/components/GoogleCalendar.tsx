import React, { useState, useEffect } from "react";
import "./GoogleCalendar.css";

const CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;
const API_KEY = process.env.REACT_APP_GOOGLE_API_KEY;

declare global {
  interface Window {
    google: any;
    gapi: any;
  }
}

interface GoogleEvent {
  id?: string;
  summary: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  htmlLink?: string;
}

interface CalendarEvent extends GoogleEvent {
  id: string;
  formattedDate: string;
  formattedTime: string;
}

export default function GoogleCalendar() {
  const [isSignedIn, setIsSignedIn] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("Inicializando...");
  const [tokenClient, setTokenClient] = useState<any>(null);
  const [gapiInited, setGapiInited] = useState<boolean>(false);
  const [gisInited, setGisInited] = useState<boolean>(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [showEventForm, setShowEventForm] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeView, setActiveView] = useState<'calendar' | 'list'>('list');


  const [eventForm, setEventForm] = useState({
    title: "",
    description: "",
    date: "",
    startTime: "10:00",
    endTime: "11:00",
  });


  useEffect(() => {
    const initializeGapi = async () => {
      try {
        setStatus("🔌 Conectando con Google Calendar...");
        
        await new Promise((resolve, reject) => {
          if (window.gapi) {
            resolve(true);
            return;
          }
          const script = document.createElement('script');
          script.src = 'https://apis.google.com/js/api.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });

        await new Promise((resolve) => {
          window.gapi.load('client', { callback: resolve });
        });

        await window.gapi.client.init({
          apiKey: API_KEY,
          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
        });

        setGapiInited(true);
        setStatus("✅ Calendario conectado");
        maybeEnableButtons();
      } catch (error) {
        console.error("Error:", error);
        setStatus("❌ Error de conexión");
      }
    };

    initializeGapi();
  }, []);


  useEffect(() => {
    const initializeGIS = () => {
      try {
        setStatus("🔧 Configurando autenticación...");
        
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
          callback: (tokenResponse: any) => {
            if (tokenResponse && tokenResponse.access_token) {
              window.gapi.client.setToken({
                access_token: tokenResponse.access_token,
              });
              setIsSignedIn(true);
              setStatus("✅ Sesión iniciada");
              loadEvents();
            }
          },
          error_callback: (error: any) => {
            console.error("Error:", error);
            setStatus("❌ Error de autenticación");
          }
        });

        setTokenClient(client);
        setGisInited(true);
        setStatus("✅ Autenticación lista");
        maybeEnableButtons();
      } catch (error) {
        console.error("Error:", error);
        setStatus("❌ Error de configuración");
      }
    };

    const loadGIS = () => {
      return new Promise((resolve, reject) => {
        if (window.google?.accounts?.oauth2) {
          resolve(true);
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.onload = () => {
          setTimeout(() => {
            if (window.google?.accounts?.oauth2) {
              resolve(true);
            } else {
              reject(new Error("GIS no cargado"));
            }
          }, 100);
        };
        script.onerror = reject;
        document.head.appendChild(script);
      });
    };

    loadGIS().then(() => {
      initializeGIS();
    }).catch(error => {
      console.error("Error:", error);
      setStatus("❌ Error cargando servicios");
    });
  }, []);

  const maybeEnableButtons = () => {
    if (gapiInited && gisInited) {
      setStatus("✅ Todo listo. Inicia sesión para comenzar");
    }
  };

  const handleLogin = () => {
    if (tokenClient) {
      setStatus("🔐 Iniciando sesión...");
      tokenClient.requestAccessToken();
    }
  };

  const handleLogout = () => {
    const token = window.gapi.client.getToken();
    if (token) {
      window.google.accounts.oauth2.revoke(token.access_token, () => {
        console.log("Sesión cerrada");
      });
      window.gapi.client.setToken(null);
      setIsSignedIn(false);
      setEvents([]);
      setStatus("✅ Sesión cerrada");
    }
  };

  const loadEvents = async () => {
    if (!isSignedIn) return;

    try {
      setLoading(true);
      const response = await window.gapi.client.calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date().toISOString(),
        showDeleted: false,
        singleEvents: true,
        maxResults: 20,
        orderBy: 'startTime',
      });

      const formattedEvents = response.result.items.map((event: any) => {
        const startDate = new Date(event.start.dateTime || event.start.date);
        const endDate = new Date(event.end.dateTime || event.end.date);
        
        return {
          id: event.id,
          summary: event.summary,
          description: event.description,
          start: event.start,
          end: event.end,
          htmlLink: event.htmlLink,
          formattedDate: startDate.toLocaleDateString('es-ES', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          formattedTime: `${startDate.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
          })} - ${endDate.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit'
          })}`
        };
      });

      setEvents(formattedEvents);
      setLoading(false);
    } catch (error) {
      console.error("Error cargando eventos:", error);
      setStatus("❌ Error cargando eventos");
      setLoading(false);
    }
  };

  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignedIn) return;

    try {
      setLoading(true);
      const startDateTime = new Date(`${eventForm.date}T${eventForm.startTime}`);
      const endDateTime = new Date(`${eventForm.date}T${eventForm.endTime}`);

      const event: GoogleEvent = {
        summary: eventForm.title,
        description: eventForm.description,
        start: {
          dateTime: startDateTime.toISOString(),
          timeZone: "America/Lima",
        },
        end: {
          dateTime: endDateTime.toISOString(),
          timeZone: "America/Lima",
        },
      };

      const response = await window.gapi.client.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
      });

      setStatus("✅ Evento creado exitosamente");
      setShowEventForm(false);
      setEventForm({
        title: "",
        description: "",
        date: "",
        startTime: "10:00",
        endTime: "11:00",
      });
      
 
      await loadEvents();
      
 
      setTimeout(() => {
        window.open(response.result.htmlLink, '_blank');
      }, 1000);

    } catch (error) {
      console.error("Error creando evento:", error);
      setStatus("❌ Error creando evento");
    } finally {
      setLoading(false);
    }
  };

  const deleteEvent = async (eventId: string) => {
    if (!isSignedIn) return;

    try {
      setLoading(true);
      await window.gapi.client.calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
      });

      setStatus("✅ Evento eliminado");
      await loadEvents();
    } catch (error) {
      console.error("Error eliminando evento:", error);
      setStatus("❌ Error eliminando evento");
    } finally {
      setLoading(false);
    }
  };


  const getTodayDate = () => {
    return new Date().toISOString().split('T')[0];
  };

  return (
    <div className="calendar-container">
  
      <div className="calendar-header">
        <div className="header-content">
          <div className="header-title">
            <div className="calendar-icon">📅</div>
            <h1>Google Calendar</h1>
          </div>
          <div className="header-actions">
            {!isSignedIn ? (
              <button
                onClick={handleLogin}
                disabled={!gapiInited || !gisInited}
                className="btn btn-primary"
              >
                {gapiInited && gisInited ? "Iniciar Sesión" : "Cargando..."}
              </button>
            ) : (
              <div className="signed-in-actions">
                <button
                  onClick={() => setShowEventForm(true)}
                  className="btn btn-success"
                >
                  + Nuevo Evento
                </button>
                <button
                  onClick={handleLogout}
                  className="btn btn-outline"
                >
                  Cerrar Sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={`status-bar ${status.includes('❌') ? 'error' : status.includes('✅') ? 'success' : 'info'}`}>
        <span>{status}</span>
      </div>

 
      <div className="calendar-content">
        {!isSignedIn ? (
          <div className="welcome-section">
            <div className="welcome-card">
              <div className="welcome-icon">🎯</div>
              <h2>Gestión de Calendario</h2>
              <p>Conecta tu cuenta de Google Calendar para gestionar tus eventos de forma profesional</p>
              <div className="feature-list">
                <div className="feature-item">
                  <span className="feature-icon">✅</span>
                  <span>Crear eventos ilimitados</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">✅</span>
                  <span>Vista de calendario integrada</span>
                </div>
                <div className="feature-item">
                  <span className="feature-icon">✅</span>
                  <span>Sincronización en tiempo real</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="dashboard">

            <div className="view-toggle">
              <button
                className={`toggle-btn ${activeView === 'list' ? 'active' : ''}`}
                onClick={() => setActiveView('list')}
              >
                📋 Lista
              </button>
              <button
                className={`toggle-btn ${activeView === 'calendar' ? 'active' : ''}`}
                onClick={() => setActiveView('calendar')}
              >
                🗓️ Calendario
              </button>
            </div>

   
            {activeView === 'list' && (
              <div className="events-section">
                <div className="section-header">
                  <h3>Próximos Eventos ({events.length})</h3>
                  <button
                    onClick={loadEvents}
                    className="btn btn-secondary"
                    disabled={loading}
                  >
                    {loading ? '🔄' : '🔄 Actualizar'}
                  </button>
                </div>

                {loading ? (
                  <div className="loading-events">
                    <div className="spinner"></div>
                    <p>Cargando eventos...</p>
                  </div>
                ) : events.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">📅</div>
                    <h4>No hay eventos programados</h4>
                    <p>Crea tu primer evento para comenzar</p>
                  </div>
                ) : (
                  <div className="events-grid">
                    {events.map((event) => (
                      <div key={event.id} className="event-card">
                        <div className="event-header">
                          <h4 className="event-title">{event.summary}</h4>
                          <button
                            onClick={() => deleteEvent(event.id)}
                            className="btn-delete"
                            title="Eliminar evento"
                          >
                            🗑️
                          </button>
                        </div>
                        {event.description && (
                          <p className="event-description">{event.description}</p>
                        )}
                        <div className="event-details">
                          <div className="event-date">
                            <span className="detail-icon">📅</span>
                            {event.formattedDate}
                          </div>
                          <div className="event-time">
                            <span className="detail-icon">⏰</span>
                            {event.formattedTime}
                          </div>
                        </div>
                        {event.htmlLink && (
                          <a
                            href={event.htmlLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="event-link"
                          >
                            Ver en Google Calendar ↗
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

  
            {activeView === 'calendar' && (
              <div className="calendar-view">
                <div className="calendar-placeholder">
                  <div className="placeholder-icon">🗓️</div>
                  <h4>Vista de Calendario</h4>
                  <p>Los eventos se muestran en tu Google Calendar oficial</p>
                  <a
                    href="https://calendar.google.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary"
                  >
                    Abrir Google Calendar
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

   
      {showEventForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Crear Nuevo Evento</h3>
              <button
                onClick={() => setShowEventForm(false)}
                className="btn-close"
              >
                ×
              </button>
            </div>
            <form onSubmit={createEvent} className="event-form">
              <div className="form-group">
                <label htmlFor="title">Título del Evento *</label>
                <input
                  type="text"
                  id="title"
                  value={eventForm.title}
                  onChange={(e) => setEventForm({...eventForm, title: e.target.value})}
                  required
                  placeholder="Ej: Reunión de equipo"
                />
              </div>

              <div className="form-group">
                <label htmlFor="description">Descripción</label>
                <textarea
                  id="description"
                  value={eventForm.description}
                  onChange={(e) => setEventForm({...eventForm, description: e.target.value})}
                  placeholder="Descripción opcional del evento"
                  rows={3}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="date">Fecha *</label>
                  <input
                    type="date"
                    id="date"
                    value={eventForm.date}
                    onChange={(e) => setEventForm({...eventForm, date: e.target.value})}
                    required
                    min={getTodayDate()}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="startTime">Hora de inicio *</label>
                  <input
                    type="time"
                    id="startTime"
                    value={eventForm.startTime}
                    onChange={(e) => setEventForm({...eventForm, startTime: e.target.value})}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="endTime">Hora de fin *</label>
                  <input
                    type="time"
                    id="endTime"
                    value={eventForm.endTime}
                    onChange={(e) => setEventForm({...eventForm, endTime: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  onClick={() => setShowEventForm(false)}
                  className="btn btn-outline"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary"
                >
                  {loading ? 'Creando...' : 'Crear Evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}