# ⛳ La Partideta Golf

Una aplicación web moderna para gestionar partidas de golf, scorecards y estadísticas en tiempo real. Diseñada para golfistas casuales y competitivos.

![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-1.0.0-green)
![React](https://img.shields.io/badge/React-18.3-61DAFB?logo=react)

## 📋 Características

### 🎯 Funcionalidades Principales
- **Partidetas Rápidas**: Crea partidas sin cuenta, juega al instante
- **Multipartidetas**: Crea grupos con código de acceso para jugar recurrentemente
- **Scorecards Digitales**: Registro de puntuaciones por hoyo en tiempo real
- **Handicap Sistema**: Cálculo automático de handicap jugador y de la partida
- **Múltiples Modos de Juego**: Stableford, Parejas, Modo A, etc.
- **Estadísticas Completas**: Análisis detallado de desempeño por jugador
- **Soporte 9 y 18 Hoyos**: Flexible para diferentes campos y tiempos
- **Sistema Premium**: Funcionalidades adicionales para usuarios premium

### 👤 Autenticación y Grupos
- Autenticación con Supabase (email/contraseña)
- Opción de juego anónimo (incógnito)
- Creación y gestión de grupos personales
- Acceso compartido mediante códigos
- Dashboard personal para gestionar partidas

### 📊 Análisis y Estadísticas
- Leaderboards en tiempo real
- Histórico de partidas
- Estadísticas por hoyo
- Análisis de handicap
- Exportación de datos

## 🚀 Inicio Rápido

### Requisitos Previos
- Node.js 16+ 
- npm o yarn
- Cuenta en Supabase (para backend)

### Instalación

1. **Clona el repositorio**
```bash
git clone https://github.com/Omiki-Golf/app.git
cd LaPartidetaKF
```

2. **Instala las dependencias**
```bash
npm install
```

3. **Configura las variables de entorno**

Crea un archivo `.env.local` en la raíz del proyecto:
```env
VITE_SUPABASE_URL=tu_url_supabase
VITE_SUPABASE_ANON_KEY=tu_anon_key
VITE_ADMIN_EMAIL=admin@example.com
VITE_ADMIN_PIN=1234
```

4. **Inicia el servidor de desarrollo**
```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:5173`

## 📦 Scripts Disponibles

```bash
# Desarrollo
npm run dev

# Build para producción
npm run build

# Preview del build
npm run preview

# Lint del código
npm run lint

# Type checking
npm run typecheck
```

## 🏗️ Estructura del Proyecto

```
src/
├── components/           # Componentes React
│   ├── Auth.tsx         # Autenticación
│   ├── GroupSetup.tsx   # Creación de grupos
│   ├── Scorecard.tsx    # Scorecards de partidas
│   ├── MyGroups.tsx     # Gestión de grupos
│   ├── AdminDashboard.tsx
│   └── ...
├── services/            # Servicios (Supabase, golf)
│   ├── supabaseClient.ts
│   ├── golfService.ts
│   └── ...
├── utils/               # Utilidades
│   ├── calculations.ts
│   ├── storage.ts
│   ├── userId.ts
│   └── ...
├── hooks/               # Hooks personalizados
├── types.ts            # Tipos TypeScript
├── App.tsx             # Componente principal
├── main.tsx            # Entry point
└── index.css           # Estilos globales
```

## 🔐 Autenticación

La aplicación soporta dos modos:

### Modo Anónimo (Incógnito)
- No requiere cuenta
- Juega partidas rápidas
- Datos guardados en localStorage
- ⚠️ Se pierden si recargas la página

### Modo Autenticado
- Crea una cuenta con email y contraseña
- Guarda todos tus grupos y partidas
- Accede desde cualquier dispositivo
- Historial completo de estadísticas

## 🎮 Cómo Jugar

### Crear una Partideta Rápida
1. Haz clic en "Crear Partideta Rápida"
2. Selecciona el campo de golf
3. Elige número de hoyos (9 o 18)
4. Agrega los jugadores
5. ¡Comienza a jugar!

### Crear un Grupo (Multipartideta)
1. Haz login o crea una cuenta
2. Selecciona "Crear Multipartideta"
3. Asigna un nombre y código
4. Comparte el código con tus amigos
5. Jugadores pueden unirse con el código

## 📱 Modos de Juego

- **Stableford**: Puntuación por puntos
- **Parejas**: Dos equipos de 2 jugadores
- **Modo A**: Competencia individual
- **Modo Personalizador**: Sistema de puntuación personalizado

## 🛠️ Tecnologías Utilizadas

### Frontend
- **React 18** - Interfaz de usuario
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Estilos
- **Lucide React** - Iconos

### Backend & Data
- **Supabase** - Base de datos y autenticación
- **PostgreSQL** - Base de datos
- **Real-time Subscriptions** - Actualizaciones en tiempo real

### Herramientas
- **ESLint** - Linting
- **PostCSS** - Procesamiento de CSS
- **QRCode** - Generación de códigos QR

## 📊 Sistema de Handicap

La aplicación implementa el sistema de handicap oficial de golf:

```
Net Score = Gross Score - Handicap del Jugador
Handicap de la Partida = Diferencia entre Handicaps
```

Cálculo automático basado en:
- Handicap índice del jugador
- Slope rating del campo
- Par del campo

## 🔔 Actualizaciones en Tiempo Real

Todos los cambios se sincronizan instantáneamente entre jugadores:
- Scorecards de otros jugadores
- Cambios en rankings
- Actualizaciones de estadísticas

## 💳 Sistema Premium

Características adicionales para suscriptores premium:
- Análisis avanzados
- Múltiples grupos sin límite
- Exportación de datos
- Estadísticas históricas detalladas

## 🐛 Modo Incógnito

Si la aplicación detecta que estás en modo incógnito:
- Aparecerá una advertencia en la parte superior
- Los datos se guardan en localStorage
- ⚠️ Importante: No recargues la página (perderás todo)

## 📄 Licencia

Este proyecto está bajo licencia MIT. Ver `LICENSE` para más detalles.

## 👨‍💻 Autor

**Federico Báez Pastor**

- GitHub: [@FedeBaezaPastor](https://github.com/FedeBaezaPastor)
- Proyecto: [Omiki-Golf/app](https://github.com/Omiki-Golf/app)

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📞 Soporte

¿Encontraste un bug o tienes una sugerencia? 
- Abre un [Issue](https://github.com/Omiki-Golf/app/issues)
- Contacta directamente

## 🔮 Próximas Características

- [ ] App móvil nativa (React Native)
- [ ] Integración con wearables
- [ ] Modo offline mejorado
- [ ] Análisis de swing
- [ ] Torneos online
- [ ] Sistema de rankings global

---

**¡Disfruta jugando al golf con La Partideta! ⛳**
