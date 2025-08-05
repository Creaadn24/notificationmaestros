// index.js - Servidor de notificaciones para Railway
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

const app = express();

// Middlewares
app.use(cors({
  origin: '*', // En producción, específica tu dominio
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// Inicializar Firebase Admin
let firebaseInitialized = false;

function initializeFirebase() {
  if (!firebaseInitialized && !admin.apps.length) {
    try {
      const serviceAccount = {
        type: "service_account",
        project_id: process.env.FIREBASE_PROJECT_ID,
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
      };

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      
      firebaseInitialized = true;
      console.log('✅ Firebase Admin inicializado correctamente');
    } catch (error) {
      console.error('❌ Error inicializando Firebase:', error);
    }
  }
}

// Ruta de salud
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 Servidor de notificaciones funcionando',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    firebase: firebaseInitialized ? 'connected' : 'disconnected'
  });
});

// Ruta para health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    firebase: firebaseInitialized,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Ruta principal para enviar notificaciones
app.post('/sendNotification', async (req, res) => {
  try {
    // Inicializar Firebase si no está inicializado
    if (!firebaseInitialized) {
      initializeFirebase();
    }

    const { token, title, body, data } = req.body;
    
    // Validar datos requeridos
    if (!token || !title || !body) {
      return res.status(400).json({ 
        success: false, 
        error: 'Token, title y body son requeridos',
        received: { token: !!token, title: !!title, body: !!body }
      });
    }

    // 🎯 EXTRAER ROUTE ESPECÍFICAMENTE
    const route = data?.route || '/reels'; // Default a /reels si no viene route
    
    console.log('📱 Data recibida:', data);
    console.log('🎯 Route extraída:', route);

    // Construir mensaje con route incluida
    const message = {
      notification: {
        title: title,
        body: body
      },
      // 🚀 DATA PRINCIPAL CON ROUTE GARANTIZADA
      data: {
        ...data,  // Incluir toda la data original
        route: route  // Asegurar que route esté presente
      },
      token: token,
      android: {
        priority: 'high',
        notification: {
          channel_id: 'default',
          priority: 'high',
          default_sound: true,
          default_vibrate_timings: true,
          sound: 'soycrea.mp3'  // 🔊 SONIDO PERSONALIZADO ANDROID
        }
      },
      apns: {
        headers: {
          'apns-priority': '10'
        },
        payload: {
          aps: {
            alert: {
              title: title,
              body: body
            },
            sound: 'soycrea.mp3',  // 🔊 SONIDO PERSONALIZADO iOS
            badge: 1
          }
        }
      }
    };

    // Convertir todos los valores de data a string (requerido por FCM)
    if (message.data) {
      message.data = Object.fromEntries(
        Object.entries(message.data).map(([key, value]) => [key, String(value)])
      );
    }

    console.log('📱 Enviando notificación a token:', token.substring(0, 20) + '...');
    console.log('📋 Data final a enviar:', message.data);
    
    // Enviar notificación
    const response = await admin.messaging().send(message);
    
    console.log('✅ Notificación enviada exitosamente:', response);
    
    res.status(200).json({ 
      success: true, 
      response: response,
      message: 'Notificación enviada correctamente',
      data_sent: message.data, // Para verificar que se envió la data con route
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error enviando notificación:', error);
    
    // Manejar errores específicos de FCM
    let errorMessage = error.message;
    let statusCode = 500;
    
    if (error.code === 'messaging/registration-token-not-registered') {
      errorMessage = 'Token de registro no válido o expirado';
      statusCode = 400;
    } else if (error.code === 'messaging/invalid-registration-token') {
      errorMessage = 'Formato de token inválido';
      statusCode = 400;
    } else if (error.code === 'messaging/mismatched-credential') {
      errorMessage = 'Credenciales de Firebase incorrectas';
      statusCode = 401;
    }
    
    res.status(statusCode).json({ 
      success: false, 
      error: errorMessage,
      code: error.code || 'unknown',
      timestamp: new Date().toISOString()
    });
  }
});

// Ruta para envío masivo (opcional)
app.post('/sendBulkNotifications', async (req, res) => {
  try {
    if (!firebaseInitialized) {
      initializeFirebase();
    }

    const { tokens, title, body, data } = req.body;
    
    if (!tokens || !Array.isArray(tokens) || tokens.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Array de tokens es requerido' 
      });
    }

    const message = {
      notification: { title, body },
      data: data ? Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, String(value)])
      ) : {},
      android: { priority: 'high' },
      apns: { headers: { 'apns-priority': '10' } }
    };

    const response = await admin.messaging().sendMulticast({
      ...message,
      tokens: tokens
    });

    console.log(`📱 Enviadas ${response.successCount}/${tokens.length} notificaciones`);
    
    res.status(200).json({ 
      success: true, 
      successCount: response.successCount,
      failureCount: response.failureCount,
      responses: response.responses
    });

  } catch (error) {
    console.error('❌ Error en envío masivo:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Middleware de error global
app.use((error, req, res, next) => {
  console.error('❌ Error global:', error);
  res.status(500).json({ 
    success: false, 
    error: 'Error interno del servidor' 
  });
});

// Inicializar Firebase al arrancar
initializeFirebase();

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`🌐 URL base: http://localhost:${PORT}`);
  console.log(`📱 Endpoint notificaciones: POST /sendNotification`);
});
