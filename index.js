// index.js - Servidor de notificaciones CORREGIDO para Railway
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
        client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-pykxn%40creamaestros-8e80b.iam.gserviceaccount.com",
        universe_domain: "googleapis.com"
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

// 🔧 RUTA PRINCIPAL CORREGIDA PARA tokenFCM
app.post('/sendNotification', async (req, res) => {
  try {
    // Inicializar Firebase si no está inicializado
    if (!firebaseInitialized) {
      initializeFirebase();
    }

    // 🔄 CAMBIO CRÍTICO: Buscar tokenFCM en lugar de token
    const { tokenFCM, title, body, data } = req.body;
    
    // 📝 LOG PARA DEBUGGING
    console.log('📥 Datos recibidos:', {
      tokenFCM: tokenFCM ? `${tokenFCM.substring(0, 20)}...` : 'NO RECIBIDO',
      title: title || 'NO RECIBIDO',
      body: body || 'NO RECIBIDO',
      data: data || 'NO RECIBIDO'
    });
    
    // 🔍 VALIDACIÓN CORREGIDA
    if (!tokenFCM || !title || !body) {
      console.log('❌ Validación fallida:', {
        tokenFCM: !!tokenFCM,
        title: !!title,
        body: !!body
      });
      
      return res.status(400).json({ 
        success: false, 
        error: 'tokenFCM, title y body son requeridos',
        received: { 
          tokenFCM: !!tokenFCM, 
          title: !!title, 
          body: !!body 
        }
      });
    }

    // 🎯 EXTRAER ROUTE ESPECÍFICAMENTE
    const route = data?.route || '/reels'; // Default a /reels si no viene route
    
    console.log('📱 Data recibida:', data);
    console.log('🎯 Route extraída:', route);

    // 🚀 CONSTRUIR MENSAJE CON tokenFCM
    const message = {
      notification: {
        title: title,
        body: body
      },
      // DATA PRINCIPAL CON ROUTE GARANTIZADA
      data: {
        ...data,  // Incluir toda la data original
        route: route  // Asegurar que route esté presente
      },
      token: tokenFCM, // 🔄 USAR tokenFCM AQUÍ
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

    console.log('📱 Enviando notificación a token:', tokenFCM.substring(0, 20) + '...');
    console.log('📋 Data final a enviar:', message.data);
    
    // Enviar notificación
    const response = await admin.messaging().send(message);
    
    console.log('✅ Notificación enviada exitosamente:', response);
    
    res.status(200).json({ 
      success: true, 
      response: response,
      message: 'Notificación enviada correctamente',
      token_usado: `${tokenFCM.substring(0, 20)}...`, // Para debugging
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

// 🔧 RUTA PARA ENVÍO MASIVO TAMBIÉN CORREGIDA
app.post('/sendBulkNotifications', async (req, res) => {
  try {
    if (!firebaseInitialized) {
      initializeFirebase();
    }

    // 🔄 CAMBIO: Buscar tokensFCM en lugar de tokens
    const { tokensFCM, title, body, data } = req.body;
    
    if (!tokensFCM || !Array.isArray(tokensFCM) || tokensFCM.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Array de tokensFCM es requerido' 
      });
    }

    const message = {
      notification: { title, body },
      data: data ? Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, String(value)])
      ) : {},
      android: { 
        priority: 'high',
        notification: {
          sound: 'soycrea.mp3'
        }
      },
      apns: { 
        headers: { 'apns-priority': '10' },
        payload: {
          aps: {
            sound: 'soycrea.mp3'
          }
        }
      }
    };

    const response = await admin.messaging().sendMulticast({
      ...message,
      tokens: tokensFCM // 🔄 USAR tokensFCM
    });

    console.log(`📱 Enviadas ${response.successCount}/${tokensFCM.length} notificaciones`);
    
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

// 🆕 RUTA ADICIONAL PARA TESTING
app.post('/test-notification', async (req, res) => {
  try {
    const { tokenFCM } = req.body;
    
    if (!tokenFCM) {
      return res.status(400).json({
        success: false,
        error: 'tokenFCM es requerido para el test'
      });
    }

    console.log('🧪 Enviando notificación de prueba...');
    
    const testMessage = {
      notification: {
        title: '🧪 Notificación de Prueba',
        body: 'Si recibes esto, el sistema funciona correctamente'
      },
      data: {
        type: 'test',
        route: '/test',
        timestamp: new Date().toISOString()
      },
      token: tokenFCM
    };

    const response = await admin.messaging().send(testMessage);
    
    res.status(200).json({
      success: true,
      message: 'Notificación de prueba enviada',
      response: response
    });

  } catch (error) {
    console.error('❌ Error en notificación de prueba:', error);
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
  console.log(`🧪 Endpoint de prueba: POST /test-notification`);
  console.log(`📨 Endpoint masivo: POST /sendBulkNotifications`);
});