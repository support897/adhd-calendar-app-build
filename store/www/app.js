/* Pace Calendar. Guest data stays on this device; signed-in data syncs
   inside that person's own Firestore profile. The day adapts to energy. */
(function () {
"use strict";
var L = window.CalmLogic;
var tr = window.t; /* the language layer (i18n.js) — aliased: too many locals are named t */
var STORE = "calmcal-v1";
/* Accounts wave: the document gets an owner. Storage keys are
   per-identity — "calmcal-v1:guest" signed out, "calmcal-v1:<uid>"
   per account — so accounts on one device never bleed across. The
   legacy bare key migrates to the guest key on first boot (the
   original stays, frozen, as a backup; nothing is ever deleted). */
var FB = window.PaceFB || { configured: false, session: function () { return null; }, userError: function () { return "Something did not work. Try again."; } };
var ACTIVE_UID = null;
try { var sess0 = FB.configured ? FB.session() : null; if (sess0 && sess0.uid) ACTIVE_UID = String(sess0.uid); } catch (e) {}
function storeKey() { return ACTIVE_UID ? STORE + ":" + ACTIVE_UID : STORE + ":guest"; }
try { if (!localStorage.getItem(STORE + ":guest") && localStorage.getItem(STORE)) localStorage.setItem(STORE + ":guest", localStorage.getItem(STORE)); } catch (e) {}
var state = load();
var selected = L.todayKey();
var currentView = "timeGridDay";
var calendar = null;
var currentTaskId = null;
var currentInstanceDate = null;
var drafts = [];
var TASK_ICONS = [
  { icon: "", name: "No icon / Sin icono", keywords: "none no icon sin icono ninguno" },
  { icon: "📌", name: "Pin / Marcar", keywords: "pin priority important note marcar prioridad" },
  { icon: "🏠", name: "Home / Hogar", keywords: "home house casa hogar" },
  { icon: "🛏️", name: "Bed / Cama", keywords: "bed bedroom sleep cama dormitorio dormir" },
  { icon: "🧹", name: "Cleaning / Limpieza", keywords: "clean cleaning chore limpiar limpieza casa" },
  { icon: "🧺", name: "Laundry / Lavandería", keywords: "laundry wash clothes ropa lavar lavanderia" },
  { icon: "🚿", name: "Shower / Ducha", keywords: "shower bath bathroom baño ducha" },
  { icon: "🍽️", name: "Dishes / Platos", keywords: "dishes kitchen plates platos cocina" },
  { icon: "🗑️", name: "Bins / Basura", keywords: "bins trash rubbish basura reciclaje" },
  { icon: "🛒", name: "Groceries / Compras", keywords: "groceries shopping market supermercado compras" },
  { icon: "🥕", name: "Food / Comida", keywords: "food cook meal comida cocinar almuerzo cena" },
  { icon: "☕", name: "Coffee / Café", keywords: "coffee cafe break café descanso" },
  { icon: "💧", name: "Water / Agua", keywords: "water drink hydrate agua beber" },
  { icon: "💊", name: "Medicine / Medicina", keywords: "medicine medication pills farmacia medicina pastillas" },
  { icon: "🩺", name: "Doctor / Médico", keywords: "doctor appointment health médico doctora cita salud" },
  { icon: "🦷", name: "Dentist / Dentista", keywords: "dentist teeth dental dentista dientes" },
  { icon: "❤️", name: "Health / Salud", keywords: "health heart care salud corazón cuidado" },
  { icon: "🏃", name: "Exercise / Ejercicio", keywords: "exercise run gym workout ejercicio correr gimnasio" },
  { icon: "🚶", name: "Walk / Caminar", keywords: "walk walking steps paseo caminar andar" },
  { icon: "🧘", name: "Stretch / Estirar", keywords: "stretch yoga breathe estirar yoga respirar" },
  { icon: "🌙", name: "Sleep / Dormir", keywords: "sleep rest bedtime sueño dormir descanso" },
  { icon: "📚", name: "Study / Estudiar", keywords: "study read books school estudiar leer libros" },
  { icon: "🎓", name: "School / Escuela", keywords: "school class homework school escuela clase deberes" },
  { icon: "💻", name: "Computer / Computadora", keywords: "computer laptop tech computadora ordenador tecnologia" },
  { icon: "💼", name: "Work / Trabajo", keywords: "work office job work oficina empleo" },
  { icon: "📧", name: "Email / Correo", keywords: "email mail inbox correo bandeja" },
  { icon: "📞", name: "Call / Llamar", keywords: "call phone telephone llamar teléfono telefono" },
  { icon: "📅", name: "Meeting / Reunión", keywords: "meeting calendar appointment reunion reunión calendario cita" },
  { icon: "✍️", name: "Write / Escribir", keywords: "write writing notes redactar escribir notas" },
  { icon: "💰", name: "Money / Dinero", keywords: "money finance cash budget dinero finanzas efectivo presupuesto" },
  { icon: "🧾", name: "Bills / Facturas", keywords: "bill invoice taxes rent factura recibo impuestos alquiler" },
  { icon: "🛍️", name: "Shopping / Comprar", keywords: "shopping buy shop compras comprar tienda" },
  { icon: "🎁", name: "Gift / Regalo", keywords: "gift present birthday regalo cumpleaños" },
  { icon: "👨‍👩‍👧", name: "Family / Familia", keywords: "family people parents kids familia padres hijos" },
  { icon: "👶", name: "Baby / Bebé", keywords: "baby infant childcare bebe bebé cuidado" },
  { icon: "🐕", name: "Dog / Perro", keywords: "dog pet puppy perro mascota" },
  { icon: "🐈", name: "Cat / Gato", keywords: "cat pet kitten gato mascota" },
  { icon: "🚗", name: "Car / Coche", keywords: "car drive vehicle coche conducir vehículo" },
  { icon: "🚌", name: "Bus / Autobús", keywords: "bus transit train transport autobus autobús transporte" },
  { icon: "✈️", name: "Travel / Viaje", keywords: "travel trip flight vacation viaje vacaciones vuelo" },
  { icon: "🗺️", name: "Map / Mapa", keywords: "map location directions mapa ubicación direcciones" },
  { icon: "🌱", name: "Plant / Planta", keywords: "plant seed grow planta semilla crecer" },
  { icon: "🌻", name: "Garden / Jardín", keywords: "garden yard outdoor jardin jardín patio" },
  { icon: "☀️", name: "Sun / Sol", keywords: "sun bright sunny sol luz" },
  { icon: "☔", name: "Rain / Lluvia", keywords: "rain weather umbrella lluvia clima paraguas" },
  { icon: "📦", name: "Package / Paquete", keywords: "package parcel delivery box paquete entrega caja" },
  { icon: "🔧", name: "Tools / Herramientas", keywords: "tools repair fix herramientas reparar arreglar" },
  { icon: "🧰", name: "Fix / Reparar", keywords: "fix repair maintenance arreglar reparar mantenimiento" },
  { icon: "🏦", name: "Bank / Banco", keywords: "bank banking money banco banca dinero" },
  { icon: "📑", name: "Paperwork / Papeleo", keywords: "paperwork forms documents documentos formularios papeleo" },
  { icon: "🔑", name: "Keys / Llaves", keywords: "keys lock access llaves cerradura acceso" },
  { icon: "🧠", name: "Focus / Enfoque", keywords: "focus think brain plan enfoque pensar cerebro plan" },
  { icon: "💡", name: "Idea / Idea", keywords: "idea think remember idea pensar recordar" },
  { icon: "🎵", name: "Music / Música", keywords: "music song listen musica música canción escuchar" },
  { icon: "🎨", name: "Art / Arte", keywords: "art paint craft creative arte pintar manualidades creativo" },
  { icon: "📷", name: "Photo / Foto", keywords: "photo camera picture foto camara cámara imagen" },
  { icon: "🧴", name: "Self-care / Cuidado personal", keywords: "self care skincare personal cuidado piel" },
  { icon: "🤝", name: "People / Personas", keywords: "people friend visit help personas amistad visitar ayudar" },
  { icon: "💌", name: "Message / Mensaje", keywords: "message text letter mensaje texto carta" },
  { icon: "🧭", name: "Plan / Planificar", keywords: "plan organize organise schedule planificar organizar horario" },
  { icon: "🌊", name: "Rest / Descanso", keywords: "rest calm break relax descanso calma pausa relajar" },
  { icon: "✅", name: "Done / Hecho", keywords: "done check complete finish hecho marcar completar terminar" },
  { icon: "🔥", name: "Urgent / Urgente", keywords: "urgent priority important urgente prioridad importante" },
  { icon: "📖", name: "Read / Leer", keywords: "read reading book leer lectura libro" },
  { icon: "🧼", name: "Wash / Lavar", keywords: "wash clean soap lavar limpiar jabón jabon" },
  { icon: "🚪", name: "Door / Puerta", keywords: "door leave entry puerta salir entrada" },
  { icon: "🪴", name: "Plant care / Cuidar plantas", keywords: "plant water gardening regar plantas jardinería jardineria" },
  { icon: "🍎", name: "Apple / Manzana", keywords: "fruit snack apple fruta manzana" },
  { icon: "🍌", name: "Banana / Plátano", keywords: "fruit banana platano fruta" },
  { icon: "🥗", name: "Salad / Ensalada", keywords: "salad healthy lunch ensalada saludable" },
  { icon: "🍳", name: "Breakfast / Desayuno", keywords: "breakfast eggs cook desayuno huevos" },
  { icon: "🥪", name: "Lunch / Almuerzo", keywords: "lunch sandwich packed almuerzo sandwich" },
  { icon: "🍝", name: "Dinner / Cena", keywords: "dinner pasta supper cena pasta" },
  { icon: "🍕", name: "Pizza / Pizza", keywords: "pizza takeaway takeout comida pedir" },
  { icon: "🍔", name: "Takeaway / Comida rápida", keywords: "burger takeaway fast food hamburguesa" },
  { icon: "🍰", name: "Baking / Hornear", keywords: "bake cake dessert hornear pastel postre" },
  { icon: "🍷", name: "Drinks / Bebidas", keywords: "wine drinks party vino bebidas fiesta" },
  { icon: "🥤", name: "Drink / Refresco", keywords: "soda juice drink refresco jugo" },
  { icon: "🧃", name: "Juice / Jugo", keywords: "juice kids lunchbox jugo" },
  { icon: "🍵", name: "Tea / Té", keywords: "tea hot drink te té infusion" },
  { icon: "🥛", name: "Milk / Leche", keywords: "milk dairy leche lacteos" },
  { icon: "🥦", name: "Veggies / Verduras", keywords: "vegetables greens verduras" },
  { icon: "🧊", name: "Freezer / Congelador", keywords: "freezer ice defrost congelador hielo" },
  { icon: "🫖", name: "Kettle / Tetera", keywords: "kettle tea tetera" },
  { icon: "🔪", name: "Chop / Cortar", keywords: "chop prep knife cortar cuchillo preparar" },
  { icon: "🍴", name: "Eat / Comer", keywords: "eat meal restaurant comer restaurante" },
  { icon: "🛋️", name: "Couch / Sofá", keywords: "couch lounge relax sofa sofá descansar" },
  { icon: "🪟", name: "Windows / Ventanas", keywords: "windows clean ventanas limpiar" },
  { icon: "🪞", name: "Mirror / Espejo", keywords: "mirror getting ready espejo arreglarse" },
  { icon: "🚽", name: "Toilet / Baño", keywords: "toilet bathroom clean inodoro baño" },
  { icon: "🪥", name: "Brush teeth / Cepillar dientes", keywords: "teeth brush toothbrush cepillo dientes" },
  { icon: "🧻", name: "Supplies / Suministros", keywords: "toilet paper supplies papel higienico" },
  { icon: "🧽", name: "Scrub / Fregar", keywords: "sponge scrub fregar esponja" },
  { icon: "🪣", name: "Bucket / Cubeta", keywords: "mop bucket clean cubeta trapear" },
  { icon: "🔌", name: "Charge / Cargar", keywords: "charge plug phone cargar enchufe celular" },
  { icon: "🔋", name: "Battery / Batería", keywords: "battery charge bateria batería" },
  { icon: "📱", name: "Phone / Teléfono", keywords: "phone mobile app telefono móvil celular" },
  { icon: "⌚", name: "Watch / Reloj", keywords: "watch time reloj hora" },
  { icon: "⏰", name: "Alarm / Alarma", keywords: "alarm wake up alarma despertar" },
  { icon: "⏳", name: "Timer / Temporizador", keywords: "timer wait temporizador esperar" },
  { icon: "🕒", name: "Time / Hora", keywords: "time clock appointment hora reloj" },
  { icon: "🗓️", name: "Plan week / Planear semana", keywords: "week plan agenda semana planear" },
  { icon: "📝", name: "Notes / Notas", keywords: "notes list memo notas lista" },
  { icon: "📋", name: "Checklist / Lista", keywords: "checklist clipboard lista verificar" },
  { icon: "📎", name: "Attach / Adjuntar", keywords: "attach clip adjuntar" },
  { icon: "✉️", name: "Letter / Carta", keywords: "letter post mail carta correo" },
  { icon: "📮", name: "Post / Enviar", keywords: "post mailbox send enviar buzón" },
  { icon: "🖨️", name: "Print / Imprimir", keywords: "print printer imprimir impresora" },
  { icon: "📊", name: "Report / Informe", keywords: "report chart stats informe gráfico" },
  { icon: "📈", name: "Progress / Progreso", keywords: "progress growth goals progreso metas" },
  { icon: "🎯", name: "Goal / Meta", keywords: "goal target focus meta objetivo" },
  { icon: "🏆", name: "Win / Logro", keywords: "win trophy achievement logro trofeo" },
  { icon: "🥇", name: "First / Primero", keywords: "first medal best primero medalla" },
  { icon: "🎉", name: "Celebrate / Celebrar", keywords: "party celebrate celebrar fiesta" },
  { icon: "🎂", name: "Birthday / Cumpleaños", keywords: "birthday cake cumpleaños pastel" },
  { icon: "🎈", name: "Party / Fiesta", keywords: "party balloon fiesta globo" },
  { icon: "🎄", name: "Holiday / Fiesta festiva", keywords: "holiday christmas navidad vacaciones" },
  { icon: "🕯️", name: "Candle / Vela", keywords: "candle calm vela calma" },
  { icon: "🙏", name: "Pray / Rezar", keywords: "pray gratitude thanks rezar gracias" },
  { icon: "📿", name: "Mindful / Atención plena", keywords: "mindful meditate meditar atención" },
  { icon: "🛁", name: "Bath / Bañera", keywords: "bath soak bañera baño" },
  { icon: "🧖", name: "Spa / Spa", keywords: "spa relax masaje relajar" },
  { icon: "💆", name: "Massage / Masaje", keywords: "massage self care masaje" },
  { icon: "💇", name: "Haircut / Corte de pelo", keywords: "haircut hair salon pelo peluquería" },
  { icon: "💅", name: "Nails / Uñas", keywords: "nails manicure uñas manicura" },
  { icon: "👕", name: "Clothes / Ropa", keywords: "clothes shirt outfit ropa camisa" },
  { icon: "👗", name: "Dress / Vestido", keywords: "dress outfit vestido" },
  { icon: "👟", name: "Shoes / Zapatos", keywords: "shoes sneakers zapatos tenis" },
  { icon: "🧦", name: "Socks / Calcetines", keywords: "socks calcetines" },
  { icon: "🎒", name: "Backpack / Mochila", keywords: "backpack school bag pack mochila escuela" },
  { icon: "👜", name: "Bag / Bolso", keywords: "bag purse pack bolso" },
  { icon: "🧳", name: "Pack / Maleta", keywords: "pack suitcase trip maleta viaje" },
  { icon: "🕶️", name: "Sunglasses / Gafas de sol", keywords: "sunglasses sun gafas sol" },
  { icon: "🧢", name: "Cap / Gorra", keywords: "cap hat gorra" },
  { icon: "🧥", name: "Jacket / Chaqueta", keywords: "jacket coat chaqueta abrigo" },
  { icon: "☂️", name: "Umbrella / Paraguas", keywords: "umbrella rain paraguas lluvia" },
  { icon: "🌡️", name: "Temperature / Temperatura", keywords: "temperature fever thermometer fiebre temperatura" },
  { icon: "🩹", name: "Bandage / Curita", keywords: "bandage first aid curita primeros auxilios" },
  { icon: "💉", name: "Vaccine / Vacuna", keywords: "vaccine injection needle vacuna inyección" },
  { icon: "🧬", name: "Test / Examen médico", keywords: "test lab blood analisis examen" },
  { icon: "🏥", name: "Hospital / Hospital", keywords: "hospital clinic clinica hospital" },
  { icon: "🚑", name: "Emergency / Emergencia", keywords: "emergency ambulance emergencia" },
  { icon: "👓", name: "Glasses / Lentes", keywords: "glasses optician eye lentes óptica ojos" },
  { icon: "👂", name: "Hearing / Audición", keywords: "ear hearing audicion oído" },
  { icon: "😴", name: "Nap / Siesta", keywords: "nap sleepy siesta dormir" },
  { icon: "🛌", name: "Bedtime / A dormir", keywords: "bedtime sleep bed acostarse dormir" },
  { icon: "🌅", name: "Morning / Mañana", keywords: "morning sunrise routine mañana rutina" },
  { icon: "🌇", name: "Evening / Tarde", keywords: "evening sunset routine tarde noche" },
  { icon: "🌃", name: "Night / Noche", keywords: "night routine noche" },
  { icon: "🚴", name: "Cycle / Bicicleta", keywords: "bike cycle ride bicicleta ciclismo" },
  { icon: "🏊", name: "Swim / Nadar", keywords: "swim pool nadar piscina" },
  { icon: "🏋️", name: "Weights / Pesas", keywords: "weights gym lift pesas gimnasio" },
  { icon: "⚽", name: "Football / Fútbol", keywords: "football soccer sport futbol deporte" },
  { icon: "🏀", name: "Basketball / Baloncesto", keywords: "basketball sport baloncesto" },
  { icon: "🎾", name: "Tennis / Tenis", keywords: "tennis sport tenis" },
  { icon: "⛳", name: "Golf / Golf", keywords: "golf sport" },
  { icon: "🥾", name: "Hike / Senderismo", keywords: "hike trail walk senderismo caminata" },
  { icon: "⛺", name: "Camp / Acampar", keywords: "camp camping tent acampar" },
  { icon: "🏖️", name: "Beach / Playa", keywords: "beach holiday playa vacaciones" },
  { icon: "🏔️", name: "Mountain / Montaña", keywords: "mountain trip montaña" },
  { icon: "🎮", name: "Game / Juego", keywords: "game play video juego jugar" },
  { icon: "🧩", name: "Puzzle / Rompecabezas", keywords: "puzzle game rompecabezas" },
  { icon: "♟️", name: "Chess / Ajedrez", keywords: "chess game ajedrez" },
  { icon: "🎬", name: "Movie / Película", keywords: "movie film watch pelicula película ver" },
  { icon: "📺", name: "TV / Televisión", keywords: "tv watch show television ver programa" },
  { icon: "🎧", name: "Listen / Escuchar", keywords: "listen podcast headphones escuchar audífonos" },
  { icon: "🎤", name: "Sing / Cantar", keywords: "sing karaoke cantar" },
  { icon: "🎸", name: "Guitar / Guitarra", keywords: "guitar practice music guitarra practicar" },
  { icon: "🎹", name: "Piano / Piano", keywords: "piano practice music practicar" },
  { icon: "🎻", name: "Violin / Violín", keywords: "violin practice music violin" },
  { icon: "🥁", name: "Drums / Batería musical", keywords: "drums practice music tambor" },
  { icon: "🎭", name: "Theatre / Teatro", keywords: "theatre show drama teatro" },
  { icon: "🎟️", name: "Tickets / Entradas", keywords: "tickets event show entradas evento" },
  { icon: "🖼️", name: "Gallery / Galería", keywords: "gallery museum art galeria museo" },
  { icon: "🧵", name: "Sew / Coser", keywords: "sew thread craft coser hilo" },
  { icon: "🧶", name: "Knit / Tejer", keywords: "knit yarn craft tejer lana" },
  { icon: "✂️", name: "Cut / Recortar", keywords: "cut scissors craft tijeras recortar" },
  { icon: "🖍️", name: "Draw / Dibujar", keywords: "draw crayon kids dibujar crayones" },
  { icon: "✏️", name: "Homework / Tarea", keywords: "pencil homework write tarea lápiz" },
  { icon: "📐", name: "Maths / Matemáticas", keywords: "maths geometry matematicas" },
  { icon: "🔬", name: "Science / Ciencia", keywords: "science lab ciencia laboratorio" },
  { icon: "🧪", name: "Experiment / Experimento", keywords: "experiment chemistry experimento quimica" },
  { icon: "🌍", name: "Language / Idioma", keywords: "language world idioma mundo" },
  { icon: "🗣️", name: "Speak / Hablar", keywords: "speak talk practice hablar practicar" },
  { icon: "💬", name: "Chat / Charla", keywords: "chat talk conversation charla conversar" },
  { icon: "📣", name: "Announce / Avisar", keywords: "announce tell remind avisar" },
  { icon: "🔔", name: "Reminder / Recordatorio", keywords: "reminder bell alert recordatorio campana" },
  { icon: "📍", name: "Place / Lugar", keywords: "place location go lugar ubicación" },
  { icon: "🏢", name: "Office / Oficina", keywords: "office building oficina edificio" },
  { icon: "🏫", name: "School run / Escuela", keywords: "school drop off escuela llevar" },
  { icon: "🏪", name: "Shop / Tienda", keywords: "shop store errand tienda mandado" },
  { icon: "🏛️", name: "Government / Gobierno", keywords: "government council gobierno tramites" },
  { icon: "⚖️", name: "Legal / Legal", keywords: "legal law court abogado legal" },
  { icon: "🔒", name: "Secure / Seguro", keywords: "lock password secure contraseña seguro" },
  { icon: "🛡️", name: "Insurance / Seguro", keywords: "insurance protect seguro proteger" },
  { icon: "💳", name: "Card / Tarjeta", keywords: "card payment pay tarjeta pago" },
  { icon: "🪙", name: "Savings / Ahorros", keywords: "savings coin ahorros moneda" },
  { icon: "📉", name: "Budget / Presupuesto", keywords: "budget spending presupuesto gastos" },
  { icon: "🛠️", name: "Maintenance / Mantenimiento", keywords: "maintenance fix mantenimiento reparar" },
  { icon: "🔩", name: "Hardware / Ferretería", keywords: "hardware screw ferreteria tornillo" },
  { icon: "🪜", name: "Ladder / Escalera", keywords: "ladder diy escalera" },
  { icon: "🪚", name: "Build / Construir", keywords: "build wood saw construir madera" },
  { icon: "🚰", name: "Tap / Grifo", keywords: "tap plumber water grifo plomero" },
  { icon: "🌳", name: "Tree / Árbol", keywords: "tree garden trees arbol jardín" },
  { icon: "🍂", name: "Rake / Rastrillar", keywords: "leaves rake autumn hojas rastrillar" },
  { icon: "🌷", name: "Flowers / Flores", keywords: "flowers bloom flores" },
  { icon: "💐", name: "Bouquet / Ramo", keywords: "bouquet gift flowers ramo regalo" },
  { icon: "🐟", name: "Fish / Pez", keywords: "fish pet feed pez mascota" },
  { icon: "🐦", name: "Bird / Pájaro", keywords: "bird pet feed pajaro ave" },
  { icon: "🐇", name: "Rabbit / Conejo", keywords: "rabbit pet conejo" },
  { icon: "🐴", name: "Horse / Caballo", keywords: "horse ride caballo montar" },
  { icon: "🐾", name: "Pet care / Mascota", keywords: "pet vet walk mascota veterinario paseo" },
  { icon: "🦮", name: "Walk dog / Pasear perro", keywords: "dog walk lead pasear perro" },
  { icon: "🧸", name: "Toys / Juguetes", keywords: "toys kids tidy juguetes niños" },
  { icon: "🍼", name: "Feed baby / Biberón", keywords: "baby feed bottle biberon bebé" },
  { icon: "👵", name: "Grandparent / Abuela", keywords: "grandma grandparent visit abuela abuelo visitar" },
  { icon: "🧑‍🏫", name: "Teacher / Maestro", keywords: "teacher class parent maestro clase" },
  { icon: "🧑‍⚕️", name: "Nurse / Enfermera", keywords: "nurse care health enfermera cuidado" },
  { icon: "🤱", name: "Care / Cuidar", keywords: "care baby parent cuidar" },
  { icon: "💞", name: "Date / Cita", keywords: "date love partner cita amor pareja" },
  { icon: "💍", name: "Anniversary / Aniversario", keywords: "anniversary wedding ring aniversario boda" },
  { icon: "👋", name: "Say hi / Saludar", keywords: "hello greet saludar hola" },
  { icon: "🚲", name: "Ride / Pedalear", keywords: "ride bike commute pedalear" },
  { icon: "🚆", name: "Train / Tren", keywords: "train commute tren" },
  { icon: "🚕", name: "Taxi / Taxi", keywords: "taxi cab ride taxi" },
  { icon: "🚢", name: "Ferry / Barco", keywords: "ferry boat barco" },
  { icon: "⛽", name: "Fuel / Gasolina", keywords: "fuel petrol gas gasolina" },
  { icon: "🅿️", name: "Parking / Estacionar", keywords: "parking car estacionar" },
  { icon: "🛞", name: "Tyres / Llantas", keywords: "tyres car service llantas" },
  { icon: "🧯", name: "Safety / Seguridad", keywords: "safety fire seguridad extintor" },
  { icon: "🧿", name: "Luck / Suerte", keywords: "luck charm suerte" },
  { icon: "⭐", name: "Star / Estrella", keywords: "star favourite favorito estrella" },
  { icon: "💜", name: "Love / Amor", keywords: "love heart favorite amor corazón" },
  { icon: "🌈", name: "Fun / Diversión", keywords: "fun rainbow happy diversión arcoíris" },
  { icon: "🍀", name: "Luck / Trébol", keywords: "luck clover suerte trebol" },
  { icon: "🪁", name: "Kite / Cometa", keywords: "kite play cometa jugar" },
  { icon: "🧘‍♀️", name: "Meditate / Meditar", keywords: "meditate calm meditar" },
  { icon: "🥳", name: "Treat / Premio", keywords: "treat reward premio recompensa" }
];
var TASK_COLORS = [
  { hex: "#7A8699", name: "Slate / Pizarra" }, { hex: "#C9920E", name: "Amber / Ámbar" },
  { hex: "#E85D75", name: "Rose / Rosa" }, { hex: "#35704E", name: "Green / Verde" },
  { hex: "#5B6BD5", name: "Blue / Azul" }, { hex: "#F2994A", name: "Orange / Naranja" },
  { hex: "#20A39E", name: "Teal / Verde azulado" }, { hex: "#8E7CC3", name: "Lavender / Lavanda" },
  { hex: "#EE6F5B", name: "Coral / Coral" }, { hex: "#9747A5", name: "Plum / Ciruela" },
  { hex: "#4FA3D1", name: "Sky / Cielo" }, { hex: "#7C8A2D", name: "Olive / Oliva" },
  { hex: "#D65792", name: "Pink / Rosa fuerte" }, { hex: "#3F536E", name: "Navy / Azul marino" },
  { hex: "#5AAE8C", name: "Mint / Menta" }, { hex: "#A66B43", name: "Brown / Marrón" },
  { hex: "#B23A48", name: "Cherry / Cereza" },
  { hex: "#E07A5F", name: "Terracotta / Terracota" },
  { hex: "#F4B400", name: "Sunflower / Girasol" },
  { hex: "#9BC53D", name: "Lime / Lima" },
  { hex: "#2E8B57", name: "Forest / Bosque" },
  { hex: "#00A896", name: "Aqua / Agua" },
  { hex: "#1D7AA8", name: "Ocean / Océano" },
  { hex: "#3D5AFE", name: "Indigo / Índigo" },
  { hex: "#6A4C93", name: "Grape / Uva" },
  { hex: "#C06C9B", name: "Orchid / Orquídea" },
  { hex: "#FF8FA3", name: "Blush / Rubor" },
  { hex: "#8D6E63", name: "Cocoa / Cacao" },
  { hex: "#546E7A", name: "Stone / Piedra" },
  { hex: "#212121", name: "Charcoal / Carbón" },
  { hex: "#B0BEC5", name: "Fog / Niebla" },
  { hex: "#FFB74D", name: "Apricot / Albaricoque" }
];

function uid() { return "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function icon(name) { return '<svg class="ico" aria-hidden="true"><use href="#' + name + '"/></svg>'; }
function $(id) { return document.getElementById(id); }
function durationLabel(task) { return task && task.allDay ? tr("All day") : tr("about {n} min", { n: task && task.durationMin }); }

function defaultSettings() {
  return {
    checkinTime: "08:00",
    wakeTime: "07:00",
    windTime: "22:00",
    names: { low: "Bad", steady: "Ok", full: "Great" },
    notif: { perm: "off", checkin: true, start: true, setup: 5, digest: true, digestTimes: ["12:30", "16:30"], done: false, doneTime: "20:00" },
    pausedDate: null,
    appearance: { theme: "white", cute: false, photo: null, photoMode: "light", bgChoice: "theme" },
    sidebarCollapsed: true,
    profileName: ""
  };
}
function isObj(x) { return !!x && typeof x === "object" && !Array.isArray(x); }
/* A clock time as HH:MM if it is a real time of day, else null. */
function validClock(x) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(x == null ? "" : x).trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return L.pad(+m[1]) + ":" + m[2];
}
function load(fromKey) {
  try {
    var raw = localStorage.getItem(fromKey || storeKey());
    if (!raw) return null;
    var s = JSON.parse(raw);
    if (!isObj(s)) return null;
    /* Normalise every field the app leans on. All of a user's data lives in
       this one key; a wrong-shaped field must recover, never brick the app. */
    if (!Array.isArray(s.tasks)) s.tasks = [];
    s.tasks = s.tasks.filter(function (t) { return isObj(t) && typeof t.title === "string"; });
    s.tasks.forEach(function (t) {
      if (!t.id) t.id = uid();
      if (typeof t.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) t.date = L.todayKey();
      if (!Array.isArray(t.skipDates)) t.skipDates = [];
      if (!Array.isArray(t.doneDates)) t.doneDates = [];
      if (!Array.isArray(t.steps)) t.steps = [];
      if (typeof t.durationMin !== "number" || !(t.durationMin > 0)) t.durationMin = 25;
      if (typeof t.status !== "string") t.status = "todo";
      t.allDay = !!t.allDay;
      if (t.remind != null && !Array.isArray(t.remind)) t.remind = null;
      if (t.repeat != null && typeof t.repeat !== "string") t.repeat = null;
      if (typeof t.icon !== "string" || t.icon.length > 8) t.icon = "";
      if (!/^#[0-9a-f]{6}$/i.test(String(t.color || ""))) t.color = L.categoryFor(t.title).color;
    });
    if (!isObj(s.dayOrder)) s.dayOrder = {};
    Object.keys(s.dayOrder).forEach(function (day) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(s.dayOrder[day])) delete s.dayOrder[day];
      else s.dayOrder[day] = s.dayOrder[day].filter(function (id) { return typeof id === "string"; }).slice(0, 5000);
    });
    if (!isObj(s.feelings)) s.feelings = {};
    if (!isObj(s.sent)) s.sent = {};
    if (typeof s.todos === "string" && s.todos) s.todos = [{ text: s.todos }];
    if (!Array.isArray(s.todos)) s.todos = [];
    /* Entry-level heal (QA's named seed, accounts phase): a bare
       string ENTRY inside todos becomes an item — repaired, never
       dropped like the field-level string already was. */
    s.todos = s.todos.map(function (t) { return typeof t === "string" && t ? { text: t } : t; });
    s.todos = s.todos.filter(function (t) { return isObj(t) && typeof t.text === "string"; });
    s.todos.forEach(function (t) {
      if (!t.id) t.id = uid();
      t.done = !!t.done;
      if (typeof t.calTaskId !== "string") t.calTaskId = null;
    });
    if (!Array.isArray(s.habits)) s.habits = [];
    s.habits = s.habits.filter(function (h) { return isObj(h) && typeof h.name === "string"; });
    s.habits.forEach(function (h) {
      if (!h.id) h.id = uid();
      if (L.HABIT_ICONS.indexOf(h.icon) === -1) h.icon = "star";
      if (!isObj(h.days)) h.days = {};
      if (typeof h.plan !== "string") h.plan = "";
      if (typeof h.tiny !== "string") h.tiny = "";
    });
    if (!Array.isArray(s.goals)) s.goals = [];
    s.goals = s.goals.filter(function (g) { return isObj(g) && typeof g.title === "string" && typeof g.end === "string"; });
    s.goals.forEach(function (g) { if (!g.id) g.id = uid(); if (typeof g.start !== "string") g.start = L.todayKey(); if (!g.pace) g.pace = "daily"; });
    s.settings = Object.assign(defaultSettings(), isObj(s.settings) ? s.settings : {});
    s.settings.notif = Object.assign(defaultSettings().notif, isObj(s.settings.notif) ? s.settings.notif : {});
    if (s.settings.notif.leads != null && !Array.isArray(s.settings.notif.leads)) delete s.settings.notif.leads;
    if (!isObj(s.settings.names)) s.settings.names = defaultSettings().names;
    ["low", "steady", "full"].forEach(function (k) {
      if (typeof s.settings.names[k] !== "string" || !s.settings.names[k].trim()) s.settings.names[k] = defaultSettings().names[k];
    });
    // The feeling words ruling (15 Oct): the three choices read
    // Bad · Ok · Great. A profile still carrying the COMPLETE
    // old factory set (Bad/Ok/Good) never customised them, so
    // it rides the rename; any customised name is the user's
    // own and stays exactly as they left it (Law B).
    if (s.settings.names.low === "Bad" && s.settings.names.steady === "Ok" && s.settings.names.full === "Good") s.settings.names.full = "Great";
    s.settings.appearance = Object.assign(defaultSettings().appearance, isObj(s.settings.appearance) ? s.settings.appearance : {});
    /* Law E: the user's own background photo is USER DATA (Law B) —
       a wrong-shaped value repairs to "no photo", never deletes by
       surprise beyond its own field. */
    if (typeof s.settings.appearance.photo !== "string" || s.settings.appearance.photo.indexOf("data:image/") !== 0 || s.settings.appearance.photo.length > 4200000) s.settings.appearance.photo = null;
    if (s.settings.appearance.photoMode !== "dark") s.settings.appearance.photoMode = "light";
    if (s.settings.appearance.bgChoice !== "photo" || !s.settings.appearance.photo) s.settings.appearance.bgChoice = "theme";
    if (typeof s.settings.sidebarCollapsed !== "boolean") s.settings.sidebarCollapsed = !!s.settings.sidebarCollapsed;
    s.settings.sidebarCollapsed = true; // Sidebar Adaptive Law, final shape: hidden on EVERY load; opening is per-session only.
    if (typeof s.settings.profileName !== "string") s.settings.profileName = s.settings.profileName == null ? "" : String(s.settings.profileName);
    if (typeof s.settings.guideDone !== "boolean") s.settings.guideDone = !!s.settings.guideDone;
    var times = (Array.isArray(s.settings.notif.digestTimes) ? s.settings.notif.digestTimes : []).map(validClock).filter(Boolean);
    s.settings.notif.digestTimes = times.length ? times : ["12:30"];
    s.welcomed = !!s.welcomed;
    s.imports = (Array.isArray(s.imports) ? s.imports : []).filter(function (r) { return r && typeof r === "object" && typeof r.key === "string"; }).map(function (r) { return { key: r.key, source: String(r.source || "calendar"), at: String(r.at || ""), count: Math.max(0, Math.round(+r.count) || 0) }; });
    return s;
  } catch (e) {}
  return null;
}
function save() {
  try {
    if (state) state.updatedAt = Date.now();
    localStorage.setItem(storeKey(), JSON.stringify(state));
  } catch (e) {}
  try { if (typeof PaceRemind !== "undefined") PaceRemind.sync(); } catch (e) {}
  scheduleSync();
}

function seed() {
  // Empty Start: every fresh visitor begins with a blank calendar.
  // Examples are never inserted unless the person chooses them.
  return { tasks: [], feelings: {}, dayOrder: {}, settings: defaultSettings(), welcomed: false, sent: {}, todos: [], habits: [], imports: [] };
}
if (!state) { state = ACTIVE_UID ? freshAccountState() : seed(); save(); if (ACTIVE_UID) { state.updatedAt = 0; try { localStorage.setItem(storeKey(), JSON.stringify(state)); } catch (e) {} } }

/* ---------- instances (recurrence expansion) ---------- */
function repeatMatches(task, key) {
  if (!task.repeat) return key === task.date;
  if (key < task.date) return false;
  var d = L.parseKey(key), wd = d.getDay();
  var r = task.repeat;
  if (r === "every day") return true;
  if (r === "every weekday") return wd >= 1 && wd <= 5;
  if (r === "every weekend") return wd === 0 || wd === 6;
  if (r === "every week") return wd === L.parseKey(task.date).getDay();
  var start = L.parseKey(task.date);
  if (r === "every 2 weeks") return wd === start.getDay() && Math.round((d - start) / 86400000) % 14 === 0;
  if (r === "every month") {
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() === Math.min(start.getDate(), last);
  }
  if (r === "every year") {
    var lastM = new Date(d.getFullYear(), start.getMonth() + 1, 0).getDate();
    return d.getMonth() === start.getMonth() && d.getDate() === Math.min(start.getDate(), lastM);
  }
  if (/^days:/.test(r)) return r.slice(5).split(",").indexOf(String(wd)) !== -1;
  var names = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  if (r === "every " + names[wd]) return true;
  return false;
}
var WD_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var WD_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
function repeatLabel(r) {
  if (!r) return "";
  if (/^days:/.test(r)) return r.slice(5).split(",").map(function (n) { return tr(WD_SHORT[+n] || ""); }).join(" ");
  return tr(r);
}
function instanceOf(task, key) {
  var copy = {}; for (var k in task) copy[k] = task[k];
  copy.date = key;
  copy.instanceDate = key;
  if (task.repeat && (task.doneDates || []).indexOf(key) !== -1) copy.status = "done";
  return copy;
}
function tasksOn(key) {
  var out = [];
  state.tasks.forEach(function (t) {
    if ((t.skipDates || []).indexOf(key) !== -1) return;
    if (repeatMatches(t, key)) out.push(instanceOf(t, key));
  });
  return out;
}
function instancesInRange(a, b) {
  var out = [], key = a;
  while (key <= b) { out = out.concat(tasksOn(key)); key = L.addDays(key, 1); }
  return out;
}
function baseTask(id) { return state.tasks.filter(function (t) { return t.id === id; })[0]; }
function levelFor(key) { return state.feelings[key] || "steady"; }
function sortForDayOrder(items, key) {
  var saved = state.dayOrder && Array.isArray(state.dayOrder[key]) ? state.dayOrder[key] : [];
  if (!saved.length) return items;
  var rank = Object.create(null), fallback = Object.create(null);
  saved.forEach(function (id, i) { rank[id] = i; });
  items.forEach(function (task, i) { fallback[task.id] = i; });
  return items.slice().sort(function (a, b) {
    var ar = Object.prototype.hasOwnProperty.call(rank, a.id) ? rank[a.id] : saved.length + fallback[a.id];
    var br = Object.prototype.hasOwnProperty.call(rank, b.id) ? rank[b.id] : saved.length + fallback[b.id];
    return ar - br;
  });
}
function adaptedFor(key) {
  var ad = L.adaptDay(tasksOn(key), levelFor(key), tasksOn(L.addDays(key, 1)));
  ad.visible = sortForDayOrder(ad.visible, key);
  ad.done = sortForDayOrder(ad.done, key);
  ad.parked = sortForDayOrder(ad.parked, key);
  return ad;
}

/* ---------- appearance + sidebar ---------- */
var THEME_COLORS = { white: "#ffffff", dark: "#161618", blush: "#fff8fa", sky: "#f7fbff", mint: "#f6fcf8", lavender: "#faf8ff", brand: "#dce1f6", photolight: "#f3f5fa", photodark: "#141f1b" };
function applyAppearance() {
  var a = state.settings.appearance;
  var root = document.documentElement;
  var photoOn = a.bgChoice === "photo" && typeof a.photo === "string" && !!a.photo;
  if (photoOn) {
    root.setAttribute("data-theme", a.photoMode === "dark" ? "photodark" : "photolight");
    root.setAttribute("data-photo", a.photoMode);
    root.style.setProperty("--photo", 'url("' + a.photo + '")');
  } else {
    root.setAttribute("data-theme", a.theme || "white");
    root.removeAttribute("data-photo");
    root.style.removeProperty("--photo");
  }
  if (a.cute) root.setAttribute("data-cute", "1"); else root.removeAttribute("data-cute");
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLORS[root.getAttribute("data-theme")] || "#ffffff");
  document.querySelectorAll(".swatch[data-theme-set]").forEach(function (b) { b.classList.toggle("is-active", !photoOn && b.getAttribute("data-theme-set") === a.theme); });
  var pa = $("photoApply");
  if (pa) {
    pa.hidden = !a.photo;
    pa.classList.toggle("is-active", photoOn);
    var dot = $("photoDot");
    if (dot && a.photo) { dot.style.backgroundImage = 'url("' + a.photo + '")'; dot.style.backgroundSize = "cover"; dot.style.backgroundPosition = "center"; }
  }
  var pr = $("photoRemove"); if (pr) pr.hidden = !a.photo;
  $("cuteToggle").checked = !!a.cute;
}
function applySidebar() {
  var root = document.documentElement;
  if (state.settings.sidebarCollapsed) root.setAttribute("data-sb", "collapsed"); else root.removeAttribute("data-sb");
  $("sbToggle").checked = !state.settings.sidebarCollapsed;
  // F1 (final sweep): the calendar measures itself at init,
  // before the sidebar settles — re-size it against the final
  // layout on every sidebar change, or a fresh phone load
  // paints the grid at a stale, narrower width forever.
  if (calendar) calendar.updateSize();
}
document.querySelectorAll(".swatch[data-theme-set]").forEach(function (b) {
  b.addEventListener("click", function () { var t = b.getAttribute("data-theme-set"); if (t !== "white" && t !== "dark" && !plusGate("look")) return; state.settings.appearance.theme = t; state.settings.appearance.bgChoice = "theme"; save(); applyAppearance(); });
});
$("cuteToggle").addEventListener("change", function () { if ($("cuteToggle").checked && !plusGate("cute")) { $("cuteToggle").checked = false; return; } state.settings.appearance.cute = $("cuteToggle").checked; save(); applyAppearance(); });
/* Law E — the user's own photo as the background. The photo is user
   data: picking another look never deletes it; only Remove does,
   and Remove carries Undo (Law B2). A soft veil + an ink set chosen
   from the photo's own brightness keep every word readable (AA). */
$("bgPhotoBtn").addEventListener("click", function () { $("bgPhotoFile").click(); });
$("bgPhotoFile").addEventListener("change", function () {
  var f = $("bgPhotoFile").files && $("bgPhotoFile").files[0];
  $("bgPhotoFile").value = "";
  if (!f) return;
  if (!plusGate("look")) return;
  var url = URL.createObjectURL(f);
  var img = new Image();
  img.onload = function () {
    URL.revokeObjectURL(url);
    var scale = Math.min(1, 1440 / Math.max(img.width, img.height));
    var w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
    var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    var cx = cv.getContext("2d"); cx.drawImage(img, 0, 0, w, h);
    var tiny = document.createElement("canvas"); tiny.width = 24; tiny.height = 24;
    var tx = tiny.getContext("2d"); tx.drawImage(cv, 0, 0, 24, 24);
    var px = tx.getImageData(0, 0, 24, 24).data, lum = 0;
    for (var i = 0; i < px.length; i += 4) lum += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) / 255;
    lum /= (px.length / 4);
    var prev = { photo: state.settings.appearance.photo, photoMode: state.settings.appearance.photoMode, bgChoice: state.settings.appearance.bgChoice };
    state.settings.appearance.photo = cv.toDataURL("image/jpeg", 0.85);
    state.settings.appearance.photoMode = lum >= 0.45 ? "light" : "dark";
    state.settings.appearance.bgChoice = "photo";
    save();
    var kept = false;
    try { kept = (JSON.parse(localStorage.getItem(storeKey())).settings.appearance.photo || "").length > 1000; } catch (e) {}
    if (!kept) {
      state.settings.appearance.photo = prev.photo; state.settings.appearance.photoMode = prev.photoMode; state.settings.appearance.bgChoice = prev.bgChoice;
      save(); applyAppearance();
      toast(tr("That photo is too big to keep on this device. A smaller one will fit."));
      return;
    }
    applyAppearance();
    toast(tr("Your photo is the background now. A soft veil keeps the words readable."));
  };
  img.onerror = function () { URL.revokeObjectURL(url); toast(tr("That file did not read as a photo. Nothing changed.")); };
  img.src = url;
});
$("photoApply").addEventListener("click", function () {
  if (!state.settings.appearance.photo) return;
  if (!plusGate("look")) return;
  state.settings.appearance.bgChoice = "photo"; save(); applyAppearance();
});
$("photoRemove").addEventListener("click", function () {
  var a = state.settings.appearance;
  var kept = { photo: a.photo, photoMode: a.photoMode };
  a.photo = null; a.bgChoice = "theme"; save(); applyAppearance();
  toast(tr("Photo removed."), function () {
    state.settings.appearance.photo = kept.photo; state.settings.appearance.photoMode = kept.photoMode; state.settings.appearance.bgChoice = "photo";
    save(); applyAppearance();
  });
});
$("sbCollapse").addEventListener("click", function () { state.settings.sidebarCollapsed = true; save(); applySidebar(); });
$("sbExpand").addEventListener("click", function () { state.settings.sidebarCollapsed = false; save(); applySidebar(); });
$("sbToggle").addEventListener("change", function () { state.settings.sidebarCollapsed = !$("sbToggle").checked; save(); applySidebar(); });
function renderRing() {
  var score = L.dayScore(adaptedFor(L.todayKey()));
  var fg = $("ringFg");
  if (fg) fg.style.strokeDashoffset = String(113 * (1 - score.pct / 100));
  var pct = $("ringPct");
  if (pct) pct.textContent = score.pct + "%";
}

/* ---------- toast ---------- */
var toastTimer = null;
function toast(msg, undoFn) {
  var t = $("toast"); t.innerHTML = ""; t.appendChild(document.createTextNode(msg));
  clearTimeout(toastTimer);
  if (typeof undoFn === "function") {
    var b = document.createElement("button");
    b.type = "button"; b.className = "toast-undo"; b.textContent = tr("Undo");
    b.addEventListener("click", function () { clearTimeout(toastTimer); t.hidden = true; undoFn(); });
    t.appendChild(b);
    t.hidden = false;
    toastTimer = setTimeout(function () { t.hidden = true; }, 6500);
  } else {
    t.hidden = false;
    toastTimer = setTimeout(function () { t.hidden = true; }, 3400);
  }
}
function restoreAt(arr, item, index) { arr.splice(Math.min(index, arr.length), 0, item); }

/* ---------- ticker ---------- */
function renderTicker() {
  var el = $("ticker"); el.innerHTML = "";
  var start = L.addDays(selected, -15);
  var names = []; for (var nd = 0; nd < 7; nd++) names.push(new Date(2024, 0, nd).toLocaleDateString(LOCALE, { weekday: "short" }).replace(".", ""));
  for (var i = 0; i < 31; i++) {
    (function (key) {
      var d = L.parseKey(key);
      var btn = document.createElement("button");
      btn.className = "tick" + (key === L.todayKey() ? " is-today" : "") + (key === selected ? " is-selected" : "");
      btn.setAttribute("data-date", key);
      var dayTasks = tasksOn(key).filter(function (t) { return t.status !== "done"; });
      var pills = "", seen = {};
      dayTasks.slice(0, 12).forEach(function (t) { if (!seen[t.color]) { seen[t.color] = 1; pills += '<span class="tick-pill" style="background:' + t.color + '"></span>'; } });
      btn.innerHTML = '<span class="tick-wd">' + names[d.getDay()] + '</span><span class="tick-num">' + d.getDate() + '</span><span class="tick-pills">' + pills + "</span>";
      btn.addEventListener("click", function () { selectDate(key, true); });
      el.appendChild(btn);
    })(L.addDays(start, i));
  }
  var sel = el.querySelector('[data-date="' + selected + '"]');
  if (sel) {
    // Centre the selected day, then snap to the nearest whole-cell
    // boundary so the strip never opens on a half-cut day (build 33:
    // the centred scroll left the week's first label clipped at the
    // screen edge — the screenshot class of fault this build fixes).
    var rawLeft = sel.offsetLeft - el.clientWidth / 2 + 26;
    var snap = 0;
    for (var ci = 0; ci < el.children.length; ci++) { if (el.children[ci].offsetLeft >= rawLeft) { snap = el.children[ci].offsetLeft - 2; break; } }
    el.scrollTo({ left: Math.max(0, snap || rawLeft), behavior: tickerBooted ? "smooth" : "auto" });
  }
  tickerBooted = true;
}
var tickerBooted = false;

var LOCALE = PACE_LANG === "es" ? "es" : "en-AU";
var FACTORY_NAMES = { low: "Bad", steady: "Ok", full: "Great" };
function displayLevelName(k) { var n = state.settings.names[k]; return n === FACTORY_NAMES[k] ? tr(n) : n; }

/* ---------- day list (the adapted plan) ---------- */
function renderDayList() {
  var key = selected;
  var ad = adaptedFor(key);
  var score = L.dayScore(ad);
  var d = L.parseKey(key);
  var level = levelFor(key);
  var carry = key === L.todayKey() ? carryoverTasks(key) : [];
  var html = "<h3>" + d.toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" }) +
    '<span class="dl-score">' + tr("{done} of {total} done at your {name} pace", { done: score.done, total: score.total, name: displayLevelName(level) }) + "</span></h3>";
  html += '<div class="dl-progress"><i style="width:' + score.pct + '%"></i></div>';
  if (carry.length) html += '<div class="carryover-card"><p>' + tr("You have {n} unfinished tasks from earlier days.", { n: carry.length }) + '</p><button class="soft-btn" data-act="carry-over">' + tr("Bring them to today") + '</button></div>';
  if (!ad.visible.length && !ad.done.length && !carry.length) html += '<div class="empty-note dock-note"><span class="dock-skip">' + skipSvg("goodbye") + '</span><span>' + tr("Nothing today. Empty is allowed.") + '</span><button class="soft-btn" data-act="add-first">' + tr("Add one task") + '</button></div>';
  ad.visible.forEach(function (t, i) { html += rowHtml(t, false, i === 0, i === ad.visible.length - 1); });
  ad.done.forEach(function (t, i) { html += rowHtml(t, true, i === 0, i === ad.done.length - 1); });
  if (ad.stretch) html += '<div class="stretch-note">' + tr("One more from tomorrow:") + ' <strong>' + esc(ad.stretch.title) + '</strong><button data-act="stretch" data-id="' + ad.stretch.id + '">' + tr("Bring it to today") + '</button></div>';
  if (ad.parked.length) html += '<p class="parked-note">' + tr(ad.parked.length === 1 ? "{n} thing parked. Parked, not dropped. Raise the level to bring them back." : "{n} things parked. Parked, not dropped. Raise the level to bring them back.", { n: ad.parked.length }) + "</p>";
  $("dayList").innerHTML = html;
  bindRows($("dayList"));
}
function carryoverTasks(key) {
  return state.tasks.filter(function (t) {
    return !t.repeat && t.date < key && t.status !== "done" && t.source !== "import" && t.source !== "sample";
  });
}
function carryOverTasks(key) {
  var pending = carryoverTasks(key);
  if (!pending.length) return;
  pending.forEach(function (t) { t.date = key; });
  state.dayOrder[key] = (state.dayOrder[key] || []).concat(pending.map(function (t) { return t.id; }));
  save(); refreshAll(); toast(tr("Brought them to today. One step at a time."));
}
function reorderDayTask(id, key, direction) {
  var ad = adaptedFor(key);
  var group = ad.visible.some(function (t) { return t.id === id; }) ? ad.visible : ad.done;
  var ids = group.map(function (t) { return t.id; });
  var from = ids.indexOf(id), to = Math.max(0, Math.min(ids.length - 1, from + direction));
  if (from < 0 || from === to) return;
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  var other = group === ad.visible ? ad.done : ad.visible;
  state.dayOrder[key] = ids.concat(other.map(function (t) { return t.id; }));
  save(); refreshAll();
}
function rowHtml(t, done, first, last) {
  var meta = [];
  if (t.time) meta.push(t.time);
  meta.push(durationLabel(t));
  if (t.steps && t.steps.length) meta.push(tr("{a} of {b} steps", { a: t.steps.filter(function (s) { return s.done; }).length, b: t.steps.length }));
  if (t.shrunk) meta.push(tr("small version"));
  if (t.repeat) meta.push(repeatLabel(t.repeat));
  var id = esc(t.id), date = esc(t.instanceDate);
  return '<div draggable="true" class="task-row' + (done ? " is-done" : "") + (t.icon ? " has-task-icon" : "") + '" data-id="' + id + '" data-date="' + date + '">' +
    '<span class="tr-dot' + (t.icon ? " has-icon" : "") + '" style="background:' + t.color + '">' + (t.icon ? esc(t.icon) : "") + '</span>' +
    '<span class="tr-main"><span class="tr-title">' + esc(t.displayTitle || t.title) + '</span><span class="tr-meta">' + esc(meta.join(" · ")) + "</span></span>" +
    '<span class="tr-actions"><button class="task-move" data-order="-1" data-id="' + id + '" data-date="' + date + '" aria-label="' + tr("Move task up") + '" title="' + tr("Move task up") + '"' + (first ? ' disabled' : '') + '>↑</button>' +
    '<button class="task-move" data-order="1" data-id="' + id + '" data-date="' + date + '" aria-label="' + tr("Move task down") + '" title="' + tr("Move task down") + '"' + (last ? ' disabled' : '') + '>↓</button>' +
    '<button class="tr-check" data-check="' + id + '" aria-label="' + tr("Mark done") + '">' + (done ? icon("i-check") : "") + "</button></span></div>";
}
function bindRows(root) {
  root.querySelectorAll(".task-row").forEach(function (row) {
    row.addEventListener("click", function (e) {
      if (e.target.closest("[data-check], [data-order]")) return;
      openTask(row.getAttribute("data-id"), row.getAttribute("data-date"));
    });
  });
  root.querySelectorAll("[data-order]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      reorderDayTask(btn.getAttribute("data-id"), btn.getAttribute("data-date"), +btn.getAttribute("data-order"));
    });
  });
  root.querySelectorAll("[data-check]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var row = btn.closest(".task-row");
      toggleDone(row.getAttribute("data-id"), row.getAttribute("data-date"));
    });
  });
  var addFirst = root.querySelector('[data-act="add-first"]');
  if (addFirst) addFirst.addEventListener("click", function () { $("addBtn").click(); });
  var carryButton = root.querySelector('[data-act="carry-over"]');
  if (carryButton) carryButton.addEventListener("click", function () { carryOverTasks(selected); });
  var st = root.querySelector('[data-act="stretch"]');
  if (st) st.addEventListener("click", function () {
    if (!plusGate("stretch")) return;
    var t = baseTask(st.getAttribute("data-id"));
    if (t) { moveInstance(t, L.addDays(selected, 1), selected); toast(tr("Brought to today. Only because you asked.")); refreshAll(); }
  });
}
function toggleDone(id, dateKey) {
  var t = baseTask(id); if (!t) return;
  if (t.repeat) {
    t.doneDates = t.doneDates || [];
    var i = t.doneDates.indexOf(dateKey);
    if (i === -1) t.doneDates.push(dateKey); else t.doneDates.splice(i, 1);
    if (t.habitId) { var hb = (state.habits || []).filter(function (x) { return x.id === t.habitId; })[0]; if (hb) { hb.days = hb.days || {}; if (i === -1) hb.days[dateKey] = true; else delete hb.days[dateKey]; } }
  } else {
    t.status = t.status === "done" ? "todo" : "done";
    // QA NIGHT F2: the payload also carries a done flag (load()
    // normalises one onto every task). It must agree with the
    // status on EVERY push — derive it here, at the write, not
    // only at load, or the synced bytes contradict themselves.
    t.done = t.status === "done";
    if (t.status === "done") toast(tr("Done. That counts."));
  }
  save(); refreshAll();
  // Shared goals (build 39): a tick on a shared step writes
  // through to the shared doc, so the whole team sees it.
  if (!t.repeat && window.PaceShareUI) window.PaceShareUI.onLocalTick(t);
}
/* Move one occurrence of a (possibly repeating) task to another date. */
function moveInstance(t, fromKey, toKey) {
  if (t.repeat || fromKey !== t.date) {
    t.skipDates = t.skipDates || [];
    if (t.skipDates.indexOf(fromKey) === -1) t.skipDates.push(fromKey);
    var copy = {}; for (var k in t) copy[k] = t[k];
    copy.id = uid(); copy.date = toKey; copy.repeat = null; copy.skipDates = []; copy.doneDates = [];
    copy.steps = (t.steps || []).map(function (s) { return { text: s.text, done: s.done }; });
    state.tasks.push(copy);
    return copy;
  }
  t.date = toKey;
  return t;
}

/* Structured-style day edges: the calendar shades the hours before you wake and after you wind down. */
function dayHours() {
  var st = state.settings || {};
  return { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: st.wakeTime || "07:00", endTime: st.windTime || "22:00" };
}
/* ---------- up next ---------- */
function renderUpNext() {
  var el = $("upNext");
  var today = L.todayKey();
  if (selected !== today) { el.hidden = true; return; }
  var ad = adaptedFor(today);
  var now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
  var timed = ad.visible.filter(function (t) { return t.time && L.toMin(t.time) >= nowMin; });
  var next = timed[0] || ad.visible[0];
  if (!next) { el.hidden = true; return; }
  el.hidden = false;
  var gapMin = (next.time && L.toMin(next.time) > nowMin) ? L.toMin(next.time) - nowMin : 0;
  var gapTxt = gapMin >= 30 ? '<span class="un-gap">Free for ' + (gapMin >= 60 ? Math.floor(gapMin / 60) + "h " : "") + (gapMin % 60 ? (gapMin % 60) + "m" : "") + ' before this</span>' : "";
  var firstStep = (next.steps && next.steps.some(function (s) { return !s.done; })) ? L.nextStepText(next) : "";
  // The step sentence reads WHOLE, on its own line (PACE-016:
  // the Start pill used to flow inline inside it and split the
  // sentence around the button). With a step standing, the
  // pill takes its own row under the sentence; without one it
  // keeps its designed spot at the end of the title line.
  el.innerHTML = '<span class="un-label">' + tr("Up next") + '</span>' + gapTxt + '<strong>' + esc(next.displayTitle || next.title) + "</strong> · " + durationLabel(next) +
    (next.time ? " · " + next.time : "") + (firstStep ? '<span class="un-step">' + esc(firstStep) + "</span>" : "") + '<button data-un="' + next.id + '"' + (firstStep ? ' class="un-start"' : "") + ">" + tr("Start") + '</button>';
  el.querySelector("[data-un]").addEventListener("click", function () {
    var t = baseTask(next.id); if (t) { t.status = "doing"; save(); refreshAll(); toast(tr("Started. One step at a time.")); }
  });
}

/* ---------- check-in ---------- */
function renderCheckin() {
  var level = state.feelings[selected];
  document.querySelectorAll(".level-btn").forEach(function (b) {
    b.classList.toggle("is-active", b.getAttribute("data-level") === level);
  });
  document.querySelectorAll("[data-level-name]").forEach(function (s) { s.textContent = displayLevelName(s.getAttribute("data-level-name")); });
  var sl = $("sideLevel");
  var todayLevel = state.feelings[L.todayKey()];
  sl.innerHTML = todayLevel ? tr("Today:") + " <strong>" + esc(displayLevelName(todayLevel)) + "</strong>" : tr("No check-in yet today");
  var adc = adaptedFor(selected), tot = adc.visible.length + adc.parked.length;
  var subEl = $("checkinSub");
  if (subEl && state.feelings[selected]) subEl.textContent = adc.parked.length ? tr("Showing {a} of {b}. {c} resting until you feel up to it. You can change this any time.", { a: adc.visible.length, b: tot, c: adc.parked.length }) : tr("Showing everything for today. You can change this any time.");
  $("checkinQ").textContent = selected === L.todayKey() ? tr("How are you feeling today?") : tr("How does this day feel?");
}
document.querySelectorAll(".level-btn").forEach(function (b) {
  b.addEventListener("click", function () {
    var level = b.getAttribute("data-level");
    state.feelings[selected] = level; save();
    markActivated("check-in");
    if (level === "low") toast(tr("Bad day. Small list — the rest is parked, safe."));
    else if (level === "full") toast(tr("Great day. A little more is on the table."));
    else toast(tr("Ok day. A small, capped list."));
    refreshAll();
  });
});

/* ---------- calendar ---------- */
function fcEvents() {
  var a = L.addDays(selected, -45), b = L.addDays(selected, 80);
  /* The calendar follows the feeling (build 34): each day is adapted at ITS
     level. Showing tasks keep their place (small version on a Bad day); resting
     tasks stay on the calendar, faded and dashed, never deleted. */
  var adaptCache = {};
  function adaptOf(key) { return adaptCache[key] || (adaptCache[key] = (function () { var ad = adaptedFor(key), m = {}; ad.visible.forEach(function (x) { m[x.id] = x; }); return { map: m, level: levelFor(key) }; })()); }
  return instancesInRange(a, b).map(function (t) {
    var ao = adaptOf(t.instanceDate), shown = ao.map[t.id], resting = t.status !== "done" && !shown;
    if (shown && shown.displayTitle) t = Object.assign({}, t, { title: shown.displayTitle, durationMin: shown.autoVersion ? shown.durationMin : (shown.shrunk ? Math.min(t.durationMin, 5) : t.durationMin) });
    var ev = { id: t.id + "@" + t.instanceDate, taskId: t.id, instanceDate: t.instanceDate, title: (t.icon ? t.icon + " " : "") + t.title, allDay: !t.time, backgroundColor: t.color, borderColor: t.color, extendedProps: { taskId: t.id, instanceDate: t.instanceDate } };
    if (t.time) {
      var startMin = L.toMin(t.time);
      ev.start = t.instanceDate + "T" + t.time + ":00";
      ev.end = t.instanceDate + "T" + L.toHHMM(startMin + t.durationMin) + ":00";
      if (startMin + t.durationMin >= 1440) { ev.end = L.addDays(t.instanceDate, 1) + "T" + L.toHHMM(startMin + t.durationMin) + ":00"; }
    } else { ev.start = t.instanceDate; }
    if (t.status === "done") ev.classNames = ["ev-done"];
    else if (resting) ev.classNames = ["ev-resting"];
    return ev;
  });
}
function initCalendar() {
  calendar = new FullCalendar.Calendar($("calendar"), {
    initialView: "timeGridDay",
    locale: PACE_LANG === "es" ? "es" : "en",
    height: "auto",
    firstDay: 1,
    headerToolbar: false,
    editable: true,
    dayMaxEvents: 3,
    businessHours: dayHours(),
    slotMinTime: "06:00:00",
    slotMaxTime: "22:00:00",
    scrollTime: (function () { var h = Math.max(6, new Date().getHours() - 1); return (h < 10 ? "0" : "") + h + ":00:00"; })(),
    eventDidMount: function (info) {
      var c = info.event.backgroundColor || "#5b6bd5";
      info.el.classList.add("ev-calm");
      info.el.style.setProperty("--ev-c", c);
      if (info.el.classList.contains("fc-daygrid-event") || info.el.classList.contains("fc-timegrid-event")) {
        info.el.style.background = "color-mix(in srgb, " + c + " 15%, var(--card))";
        info.el.style.borderLeft = "3px solid " + c;
        info.el.style.color = "var(--ink)";
      }
    },
    eventDurationEditable: true,
    longPressDelay: 250,
    events: fcEvents(),
    eventMinHeight: 34,
    eventContent: function (arg) {
      var v = arg.view.type;
      if (v === "dayGridMonth") return;
      var ep = arg.event.extendedProps || {}, isDone = (arg.event.classNames || []).indexOf("ev-done") >= 0 || (arg.el && arg.el.classList.contains("ev-done"));
      var wrap = document.createElement("div"); wrap.className = "ev-row";
      var chk = document.createElement("button"); chk.type = "button"; chk.className = "ev-check" + (isDone ? " is-on" : "");
      chk.setAttribute("aria-label", tr("Mark done")); chk.setAttribute("aria-pressed", String(!!isDone)); chk.innerHTML = isDone ? icon("i-check") : "";
      ["mousedown", "touchstart", "pointerdown"].forEach(function (n) { chk.addEventListener(n, function (e) { e.stopPropagation(); }); });
      chk.addEventListener("click", function (e) { e.stopPropagation(); e.preventDefault(); toggleDone(ep.taskId, ep.instanceDate); });
      var body = document.createElement("span"); body.className = "ev-body";
      var t = document.createElement("span"); t.className = "ev-t"; t.textContent = arg.event.title;
      var emo = taskEmoji(arg.event.title); if (emo) wrap.setAttribute("data-emo", emo);
      body.appendChild(t);
      var bt = baseTask(ep.taskId);
      if (bt && v !== "timeGridWeek") { var m = document.createElement("span"); m.className = "ev-m"; m.textContent = [bt.time, durationLabel(bt)].filter(Boolean).join(" \u00b7 "); body.appendChild(m); }
      wrap.appendChild(chk); wrap.appendChild(body);
      return { domNodes: [wrap] };
    },
    dateClick: function (info) {
      selectDate(info.dateStr.slice(0, 10), false);
      if (!info.allDay && info.dateStr.length > 10 && /timeGrid/.test(info.view.type)) {
        $("addBtn").click();
        $("fDate").value = info.dateStr.slice(0, 10);
        $("fTime").value = info.dateStr.slice(11, 16);
        var dt = document.querySelector("#addSheet details"); if (dt) dt.open = true; var ft = $("fTitle"); if (ft) ft.focus();
      }
    },
    eventClick: function (info) { openTask(info.event.extendedProps.taskId, info.event.extendedProps.instanceDate); },
    eventDrop: function (info) {
      var t = baseTask(info.event.extendedProps.taskId); if (!t) return;
      var fromKey = info.event.extendedProps.instanceDate;
      var newStart = info.event.start;
      var newKey = L.toKey(newStart);
      if (t.repeat || fromKey !== t.date) {
        var copy = moveInstance(t, fromKey, newKey);
        if (info.event.allDay === false && newStart.getHours() !== undefined) copy.time = L.pad(newStart.getHours()) + ":" + L.pad(newStart.getMinutes());
      } else {
        t.date = newKey;
        if (!info.event.allDay) t.time = L.pad(newStart.getHours()) + ":" + L.pad(newStart.getMinutes());
      }
      save(); refreshAll(); toast(tr("Moved. The day re-shaped itself."));
    },
    eventResize: function (info) {
      var t = baseTask(info.event.extendedProps.taskId); if (!t) return;
      var mins = Math.max(5, Math.round((info.event.end - info.event.start) / 60000));
      t.durationMin = mins; save(); refreshAll();
    },
    datesSet: function () { renderTitle(); }
  });
  calendar.render();
  var style = document.createElement("style");
  style.textContent = ".ev-done{opacity:.45} .ev-done .fc-event-title{text-decoration:line-through}";
  document.head.appendChild(style);
}
function renderTitle() {
  var d = calendar ? calendar.getDate() : L.parseKey(selected);
  $("monthTitle").textContent = d.toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
}
function refreshCalendar() {
  if (!calendar) return;
  calendar.removeAllEvents();
  fcEvents().forEach(function (e) { calendar.addEvent(e); });
}
function selectDate(key, jumpCalendar) {
  selected = key;
  if (calendar && jumpCalendar) calendar.gotoDate(key);
  renderTicker(); renderDayList(); renderUpNext(); renderCheckin(); renderYear();
}
$("goalBtn").addEventListener("click", function () {
  var side = document.querySelector('.side-item[data-panel="goals"]'); if (side) side.click();
  setTimeout(function () { var b = $("goalNewBtn"); if (b) b.click(); }, 60);
});
$("monthTitle").addEventListener("click", function () { selectDate(L.todayKey(), true); });
document.querySelectorAll(".segmented button").forEach(function (b) {
  b.addEventListener("click", function () {
    document.querySelectorAll(".segmented button").forEach(function (x) { x.classList.remove("is-active"); });
    b.classList.add("is-active");
    var v = b.getAttribute("data-view");
    currentView = v;
    setBottomTab(v === "timeGridDay" && selected === L.todayKey() ? "today" : "calendar");
    if (v === "year") { $("calendar").hidden = true; $("yearView").hidden = false; renderYear(); }
    else { $("calendar").hidden = false; $("yearView").hidden = true; calendar.changeView(v, selected); }
  });
});
function renderYear() {
  if (currentView !== "year") return;
  var year = L.parseKey(selected).getFullYear();
  var html = '<div class="year-grid">';
  var monthNames = []; for (var mn = 0; mn < 12; mn++) monthNames.push(new Date(2024, mn, 1).toLocaleDateString(LOCALE, { month: "long" }));
  for (var m = 0; m < 12; m++) {
    var first = new Date(year, m, 1);
    var daysIn = new Date(year, m + 1, 0).getDate();
    var lead = (first.getDay() + 6) % 7;
    html += '<div class="mini-month"><h4>' + monthNames[m] + '</h4><div class="mm-grid">';
    for (var i = 0; i < lead; i++) html += '<span class="mm-day mm-blank"></span>';
    for (var dnum = 1; dnum <= daysIn; dnum++) {
      var key = year + "-" + L.pad(m + 1) + "-" + L.pad(dnum);
      var count = tasksOn(key).filter(function (t) { return t.status !== "done"; }).length;
      var cls = "mm-day" + (count === 1 ? " has-1" : count === 2 ? " has-2" : count >= 3 ? " has-3" : "") + (key === L.todayKey() ? " is-today" : "");
      html += '<button class="' + cls + '" data-ydate="' + key + '">' + dnum + "</button>";
    }
    html += "</div></div>";
  }
  $("yearView").innerHTML = html + "</div>";
  $("yearView").querySelectorAll("[data-ydate]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelector('.segmented button[data-view="timeGridDay"]').click();
      selectDate(btn.getAttribute("data-ydate"), true);
    });
  });
}

/* ---------- panels ---------- */
document.querySelectorAll(".side-item").forEach(function (b) {
  b.addEventListener("click", function () {
    // The Progress panel holds the To Do board + the round-up
    // (both Plus rows of the split) — its entry is the gate.
    if (b.getAttribute("data-panel") === "progress" && !plusGate("board")) return;
    document.querySelectorAll(".side-item").forEach(function (x) { x.classList.remove("is-active"); });
    document.querySelectorAll(".panel").forEach(function (x) { x.classList.remove("is-active"); });
    b.classList.add("is-active");
    var panelName = b.getAttribute("data-panel");
    $("panel-" + panelName).classList.add("is-active");
    setBottomTab(panelName === "calendar" ? (selected === L.todayKey() && currentView === "timeGridDay" ? "today" : "calendar") : (panelName === "todo" || panelName === "capture" ? panelName : "more"));
    if (panelName === "progress") renderProgress();
    // Opening Goals always re-renders it (build 39): shared
    // goals arrive async, so the section must draw on arrival
    // at the panel, not only on data events.
    if (panelName === "goals" && window.PaceGoalsUI) window.PaceGoalsUI.renderGoals();
    // FullCalendar sizes itself while visible. Returning from a
    // hidden panel must re-measure after the calendar has its width.
    if (panelName === "calendar" && calendar) {
      requestAnimationFrame(function () { calendar.updateSize(); });
    }

    // Phone + the Muse-app shape: choosing an area shows it —
    // the menu gives the screen back (the sliver tap and the
    // close button do the same when no choice is made).
    if (window.innerWidth <= 700 && !state.settings.sidebarCollapsed) {
      state.settings.sidebarCollapsed = true; save(); applySidebar();
    }
  });
});
// The sliver: one tap on the squeezed content strip closes
// the menu and returns the full screen (phone widths; the
// element only exists visually there, while the menu is open).
$("sbSliver").addEventListener("click", function () {
  state.settings.sidebarCollapsed = true; save(); applySidebar();
});
function setBottomTab(name) {
  document.querySelectorAll("#bottomTabs [data-tab]").forEach(function (b) {
    var active = b.getAttribute("data-tab") === name;
    b.classList.toggle("is-active", active);
    if (active) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
}
function showPanel(name) { document.querySelector('.side-item[data-panel="' + name + '"]').click(); }
document.querySelectorAll("#bottomTabs [data-tab]").forEach(function (b) {
  b.addEventListener("click", function () {
    var tab = b.getAttribute("data-tab");
    if (tab === "today") {
      var day = document.querySelector('.segmented button[data-view="timeGridDay"]');
      if (day && currentView !== "timeGridDay") day.click();
      selectDate(L.todayKey(), true);
      showPanel("calendar");
      setBottomTab("today");
    } else if (tab === "more") {
      var collapsed = document.documentElement.getAttribute("data-sb") === "collapsed";
      (collapsed ? $("sbExpand") : $("sbCollapse")).click();
      setBottomTab("more");
    } else {
      showPanel(tab);
      setBottomTab(tab);
    }
  });
});

/* ---------- quick add ---------- */
var addCat = null;
function pickAddCat(c) { addCat = c; renderCatChips($("fCatChips"), c ? c.id : null, pickAddCat, true); }
var addRemind = [];
function renderAddRemind() {
  var box = $("fRemChips"); if (!box) return;
  box.innerHTML = "";
  REMIND_MINS.forEach(function (m) {
    box.appendChild(chipButton(remindLabel(m), addRemind.indexOf(m) !== -1, function () {
      var i = addRemind.indexOf(m); if (i === -1) addRemind.push(m); else addRemind.splice(i, 1);
      addRemind = cleanLeads(addRemind); renderAddRemind();
    }));
  });
}
$("addBtn").addEventListener("click", function () {
  addRemind = defaultLeads().slice(); renderAddRemind();
  $("quickText").value = ""; $("fTitle").value = ""; $("fLink").value = "";
  $("fDate").value = selected; $("fTime").value = ""; $("fDur").value = 25;
  $("fMin").value = ""; $("fFull").value = ""; $("fEssential").checked = false;
  $("quickPreview").hidden = true;
  $("fRepeat").value = ""; addCat = null; renderCatChips($("fCatChips"), null, pickAddCat, true);
  $("addSheet").hidden = false;
  setTimeout(function () { $("quickText").focus(); }, 50);
});
$("addCancel").addEventListener("click", function () {
  $("addSheet").hidden = true;
  if (guideResumeAfterTask !== null) { guideResumeAfterTask = null; showGuide(guideStep); }
});
$("quickText").addEventListener("input", function () {
  var v = $("quickText").value.trim();
  if (!v) { $("quickPreview").hidden = true; return; }
  var item = L.parseItem(v, selected);
  if (!item) { $("quickPreview").hidden = true; return; }
  $("quickPreview").hidden = false;
  var chip = function (cls, t) { return '<span class="qchip ' + cls + '">' + esc(t) + '</span>'; };
  var rem = (item.time && !item.allDay) ? chip("qc-rem", "Reminder " + (leadsFor(item)[0] || 10) + " min before") : "";
  $("quickPreview").innerHTML = "<strong>" + esc(item.title) + "</strong><div class=\"qchips\">" +
    chip("qc-date", L.parseKey(item.date).toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short" })) +
    (item.time ? chip("qc-time", tr("at {time}", { time: item.time })) : item.allDay ? "" : chip("qc-none", tr("no time yet"))) +
    chip("qc-dur", durationLabel(item)) +
    (item.repeat ? chip("qc-rep", "Repeats " + item.repeat) : "") + rem +
    (item.priority ? chip("qc-ess", "Priority " + ["", "low", "medium", "high"][item.priority]) : "") +
    (item.essential ? chip("qc-ess", "must not slip") : "") + "</div>";
});
document.querySelectorAll("#quickSuggest [data-add]").forEach(function (b) {
  b.addEventListener("click", function () {
    var inp = $("quickText"), add = b.getAttribute("data-add");
    inp.value = (inp.value.replace(/\s+$/, "") + (add === "!!!" ? "" : " ") + add).trim();
    inp.dispatchEvent(new Event("input", { bubbles: true })); inp.focus();
  });
});
$("addSave").addEventListener("click", function () {
  // A smallest version typed at creation is a teach (Plus);
  // refused, the task still saves — without the taught version.
  var minV = $("fMin").value.trim();
  if (minV && !plusGate("steps")) minV = "";
  var task = null, qLink = "";
  var manualTitle = $("fTitle").value.trim();
  if (manualTitle) {
    var cat = L.categoryFor(manualTitle);
    task = { title: manualTitle, date: $("fDate").value || selected, time: $("fTime").value || null, durationMin: Math.max(5, +$("fDur").value || 25), priority: 0, repeat: null, category: cat.id, color: cat.color, essential: $("fEssential").checked, steps: L.decompose(manualTitle, +$("fDur").value || 25, false), minVersion: minV, fullVersion: $("fFull").value.trim() };
  } else if ($("quickText").value.trim()) {
    var qs = splitLink($("quickText").value.trim()); qLink = qs.link;
    var item = L.parseItem(qs.text, selected);
    if (item) task = { title: item.title, date: item.date, time: item.time, durationMin: item.durationMin, priority: item.priority, repeat: item.repeat, category: item.category, color: item.color, essential: item.essential, steps: item.steps, minVersion: minV, fullVersion: $("fFull").value.trim() };
  }
  if (!task) { toast(tr("Give it a title first, even a messy one.")); return; }
  if ($("fRepeat").value) task.repeat = $("fRepeat").value;
  var fl = cleanUrl($("fLink").value) || qLink; if (fl) task.link = fl;
  if (addCat) { task.category = addCat.id; task.color = addCat.color; }
  task.remind = cleanLeads(addRemind); /* its own reminders, not the general setting */
  task.id = uid(); task.status = "todo"; task.source = "manual"; task.originalText = $("quickText").value.trim(); task.skipDates = []; task.doneDates = [];
  state.tasks.push(task); save(); markActivated("event");
  $("addSheet").hidden = true;
  selectDate(task.date, true); refreshAll();
  toast(tr("Added. Small and clear."));
  if (guideResumeAfterTask !== null) {
    var nextGuideStep = guideResumeAfterTask; guideResumeAfterTask = null;
    setTimeout(function () { showGuide(nextGuideStep); }, 80);
  }
});

/* Links and phone numbers in a task (Structured: "notes, meeting links or phone numbers"). */
function cleanUrl(u) {
  u = String(u || "").trim(); if (!u) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) { if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(u)) u = "https://" + u; else return ""; }
  return /^https?:\/\//i.test(u) ? u.slice(0, 500) : "";
}
function splitLink(text) {
  var m = String(text || "").match(/https?:\/\/\S+/i);
  if (!m) return { text: text, link: "" };
  return { text: String(text).replace(m[0], " ").replace(/\s+/g, " ").trim(), link: cleanUrl(m[0]) };
}
function linksOf(t) {
  var out = [], seen = {};
  function add(kind, val, label) { if (val && !seen[val]) { seen[val] = 1; out.push({ kind: kind, val: val, label: label }); } }
  if (t.link) add("url", t.link, t.link.replace(/^https?:\/\/(www\.)?/i, "").slice(0, 40));
  var notes = String(t.notes || "");
  (notes.match(/https?:\/\/[^\s<>"]+/gi) || []).forEach(function (u) { var c = cleanUrl(u); add("url", c, c.replace(/^https?:\/\/(www\.)?/i, "").slice(0, 40)); });
  (notes.match(/\+?\d[\d\s().-]{6,}\d/g) || []).forEach(function (p) { var d = p.replace(/[^\d+]/g, ""); if (d.length >= 7 && d.length <= 15) add("tel", "tel:" + d, p.trim()); });
  return out;
}
function renderTaskLinks(t) {
  var box = $("dLinks"); if (!box) return;
  box.innerHTML = "";
  linksOf(t).forEach(function (l) {
    var a = document.createElement("a"); a.className = "task-link-chip"; a.href = l.val; a.textContent = (l.kind === "tel" ? "Call " : "Open ") + l.label;
    if (l.kind === "url") { a.target = "_blank"; a.rel = "noopener noreferrer"; }
    box.appendChild(a);
  });
}
/* ---------- task sheet ---------- */

["dNotes", "dLink"].forEach(function (id) {
  var el = $(id); if (!el) return;
  el.addEventListener("input", function () { var t = baseTask(currentTaskId); if (t) renderTaskLinks({ link: cleanUrl($("dLink").value), notes: $("dNotes").value }); });
});
function openTask(id, instanceDate) {
  var t = baseTask(id); if (!t) return;
  currentTaskId = id; currentInstanceDate = instanceDate || t.date;
  var inst = instanceOf(t, currentInstanceDate);
  $("dTitle").textContent = inst.title;
  $("dLook").open = false;
  $("dIconSearch").value = "";
  $("dCustomColor").value = /^#[0-9a-f]{6}$/i.test(String(t.color || "")) ? t.color : L.categoryFor(t.title).color;
  $("dCustomHex").value = $("dCustomColor").value.toUpperCase();
  renderTaskIconPicker(t);
  renderTaskColorPicker(t);
  renderTaskOrganise(t);
  var meta = [];
  meta.push(L.parseKey(currentInstanceDate).toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" }));
  if (inst.time) meta.push(inst.time);
  meta.push(durationLabel(inst));
  if (inst.repeat) meta.push(tr("repeats {repeat} · changes to date or done apply to this day only", { repeat: repeatLabel(inst.repeat) }));
  if (inst.source === "sample") meta.push(tr("sample task"));
  $("dMeta").textContent = meta.join(" · ");
  renderSteps(t);
  $("dNotes").value = typeof t.notes === "string" ? t.notes : "";
  $("dLink").value = t.link || ""; renderTaskLinks(t);
  renderTaskAudio(t);
  $("dMin").value = t.minVersion || "";
  $("dFull").value = t.fullVersion || "";
  $("dDate").value = currentInstanceDate;
  $("dTime").value = t.time || "";
  $("dDur").value = t.durationMin;
  $("dEssential").checked = !!t.essential;
  if (t.originalText) { $("dOriginalWrap").hidden = false; $("dOriginal").textContent = t.originalText; }
  else $("dOriginalWrap").hidden = true;
  $("taskSheet").hidden = false;
}
function renderTaskIconPicker(task) {
  var wrap = $("dIconPicker"); if (!wrap) return;
  var query = String($("dIconSearch").value || "").trim().toLowerCase();
  var list = TASK_ICONS.filter(function (item) {
    return !query || (item.name + " " + item.keywords + " " + item.icon).toLowerCase().indexOf(query) !== -1;
  });
  wrap.innerHTML = "";
  wrap.setAttribute("aria-label", tr("Task icons"));
  if (!list.length) { wrap.innerHTML = '<p class="hint task-icon-empty">' + tr("No icons match that search.") + "</p>"; return; }
  list.forEach(function (item) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "task-icon-option" + (String(task.icon || "") === item.icon ? " is-on" : "");
    button.setAttribute("aria-label", tr("Use task icon") + " " + item.name);
    button.setAttribute("aria-pressed", String(String(task.icon || "") === item.icon));
    button.title = item.name;
    button.textContent = item.icon || "×";
    button.addEventListener("click", function () {
      task.icon = item.icon;
      save(); renderTaskIconPicker(task); refreshAll();
    });
    wrap.appendChild(button);
  });
}
function renderTaskColorPicker(task) {
  var wrap = $("dColorPicker"); if (!wrap) return;
  wrap.innerHTML = "";
  wrap.setAttribute("aria-label", tr("Task colors"));
  TASK_COLORS.forEach(function (item) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "task-color-option" + (String(task.color || "").toUpperCase() === item.hex ? " is-on" : "");
    button.style.backgroundColor = item.hex;
    button.setAttribute("aria-label", tr("Use color {name}", { name: item.name }));
    button.setAttribute("aria-pressed", String(String(task.color || "").toUpperCase() === item.hex));
    button.title = item.name;
    button.addEventListener("click", function () {
      task.color = item.hex;
      $("dCustomColor").value = item.hex;
      $("dCustomHex").value = item.hex;
      save(); renderTaskColorPicker(task); refreshAll();
    });
    wrap.appendChild(button);
  });
}
$("dIconSearch").addEventListener("input", function () {
  var task = baseTask(currentTaskId); if (task) renderTaskIconPicker(task);
});
$("dCustomColor").addEventListener("input", function () {
  var task = baseTask(currentTaskId);
  if (!task || !/^#[0-9a-f]{6}$/i.test(this.value)) return;
  task.color = this.value.toUpperCase();
  $("dCustomHex").value = task.color;
  save(); renderTaskColorPicker(task); refreshAll();
});
$("dCustomHex").addEventListener("input", function () {
  var task = baseTask(currentTaskId), value = String(this.value || "").trim();
  if (!task || !/^#[0-9a-f]{6}$/i.test(value)) return;
  task.color = value.toUpperCase();
  $("dCustomColor").value = task.color;
  save(); renderTaskColorPicker(task); refreshAll();
});

/* ---------- organise: category, repeat, reminders ---------- */
var REMIND_MINS = [0, 5, 10, 15, 30, 60, 1440];
function remindLabel(m) {
  if (m === 0) return tr("At start time");
  if (m === 5) return tr("5 min before");
  if (m === 10) return tr("10 min before");
  if (m === 15) return tr("15 min before");
  if (m === 30) return tr("30 min before");
  if (m === 60) return tr("1 hour before");
  if (m === 1440) return tr("1 day before");
  return tr("{n} min before", { n: m });
}
function cleanLeads(list) {
  var seen = {}, out = [];
  (list || []).forEach(function (v) { v = Math.round(+v); if (v >= 0 && v <= 10080 && !seen[v]) { seen[v] = 1; out.push(v); } });
  return out.sort(function (x, y) { return x - y; });
}
function defaultLeads() { var n = state.settings.notif; return Array.isArray(n.leads) ? cleanLeads(n.leads) : [n.setup == null ? 5 : n.setup]; }
function leadsFor(t) { return Array.isArray(t.remind) ? cleanLeads(t.remind) : defaultLeads(); }
function chipButton(label, on, onClick, dot, cls) {
  var b = document.createElement("button");
  b.type = "button"; b.className = "chip" + (cls ? " " + cls : "") + (on ? " is-on" : "");
  b.setAttribute("aria-pressed", String(!!on));
  if (dot) { var d = document.createElement("span"); d.className = "chip-dot"; d.style.background = dot; b.appendChild(d); }
  b.appendChild(document.createTextNode(label));
  b.addEventListener("click", onClick);
  return b;
}
function renderCatChips(box, currentId, onPick, withAuto) {
  if (!box) return;
  box.innerHTML = "";
  if (withAuto) box.appendChild(chipButton(tr("Auto"), !currentId, function () { onPick(null); }));
  L.CATEGORY_LIST.forEach(function (c) {
    box.appendChild(chipButton(tr(c.label), currentId === c.id, function () { onPick(c); }, c.color));
  });
}
function repeatOptionFor(t) {
  var r = t.repeat || "";
  if (/^days:/.test(r)) return "custom";
  return r;
}
function renderTaskOrganise(t) {
  renderCatChips($("dCatChips"), t.category, function (c) {
    t.category = c.id; t.color = c.color;
    $("dCustomColor").value = c.color; $("dCustomHex").value = c.color;
    save(); renderTaskOrganise(t); renderTaskColorPicker(t); refreshAll();
  }, false);
  var sel = $("dRepeat");
  [].slice.call(sel.querySelectorAll("option[data-dyn]")).forEach(function (o) { o.remove(); });
  var cur = repeatOptionFor(t);
  if (cur && !sel.querySelector('option[value="' + cur + '"]')) {
    var o = document.createElement("option"); o.value = cur; o.textContent = repeatLabel(t.repeat); o.setAttribute("data-dyn", "1"); sel.insertBefore(o, sel.firstChild.nextSibling);
  }
  sel.value = cur;
  var days = $("dRepeatDays");
  days.hidden = cur !== "custom";
  days.innerHTML = "";
  if (cur === "custom") {
    var on = String(t.repeat).slice(5).split(",");
    [1, 2, 3, 4, 5, 6, 0].forEach(function (wd) {
      var isOn = on.indexOf(String(wd)) !== -1;
      days.appendChild(chipButton(tr(WD_SHORT[wd]), isOn, function () {
        var set = on.filter(function (x) { return x !== ""; });
        var i = set.indexOf(String(wd));
        if (i === -1) set.push(String(wd)); else if (set.length > 1) set.splice(i, 1);
        t.repeat = "days:" + set.sort().join(",");
        save(); renderTaskOrganise(t); refreshAll();
      }, null, "chip-day"));
    });
  }
  var box = $("dRemChips"), useDefault = !Array.isArray(t.remind), leads = leadsFor(t);
  $("dRemDefault").checked = useDefault;
  box.innerHTML = "";
  REMIND_MINS.concat(leads.filter(function (m) { return REMIND_MINS.indexOf(m) === -1; })).forEach(function (m) {
    box.appendChild(chipButton(remindLabel(m), leads.indexOf(m) !== -1, function () {
      var base = Array.isArray(t.remind) ? cleanLeads(t.remind) : defaultLeads().slice();
      var i = base.indexOf(m);
      if (i === -1) base.push(m); else base.splice(i, 1);
      t.remind = cleanLeads(base);
      save(); renderTaskOrganise(t);
    }));
  });
}
$("dRepeat").addEventListener("change", function () {
  var t = baseTask(currentTaskId); if (!t) return;
  var v = this.value;
  if (v === "custom") t.repeat = /^days:/.test(t.repeat || "") ? t.repeat : "days:" + L.parseKey(currentInstanceDate).getDay();
  else t.repeat = v || null;
  if (t.repeat && !t.doneDates) t.doneDates = [];
  save(); renderTaskOrganise(t); refreshAll();
});
$("dRemDefault").addEventListener("change", function () {
  var t = baseTask(currentTaskId); if (!t) return;
  t.remind = this.checked ? null : defaultLeads().slice();
  save(); renderTaskOrganise(t);
});
function renderLeadChips() {
  var box = $("nLeads"); if (!box) return;
  var n = state.settings.notif, leads = defaultLeads();
  box.innerHTML = "";
  REMIND_MINS.concat(leads.filter(function (m) { return REMIND_MINS.indexOf(m) === -1; })).forEach(function (m) {
    box.appendChild(chipButton(remindLabel(m), leads.indexOf(m) !== -1, function () {
      var cur = defaultLeads().slice(), i = cur.indexOf(m);
      if (i === -1) cur.push(m); else cur.splice(i, 1);
      n.leads = cleanLeads(cur);
      save(); renderLeadChips();
    }));
  });
}
function renderSteps(t) {
  var box = $("dSteps");
  $("dBreak").hidden = !!(t.steps && t.steps.length);
  if (!t.steps || !t.steps.length) { box.innerHTML = '<p class="hint">' + tr("No steps yet.") + '</p>'; return; }
  box.innerHTML = t.steps.map(function (s, i) {
    return '<label class="step-row' + (s.done ? " is-done" : "") + '"><input type="checkbox" data-step="' + i + '"' + (s.done ? " checked" : "") + "><span>" + esc(s.text) + "</span></label>";
  }).join("");
  box.querySelectorAll("[data-step]").forEach(function (cb) {
    cb.addEventListener("change", function () {
      t.steps[+cb.getAttribute("data-step")].done = cb.checked;
      save(); renderSteps(t); refreshAll();
    });
  });
}
$("dBreak").addEventListener("click", function () {
  var t = baseTask(currentTaskId); if (!t) return;
  if (!plusGate("steps")) return;
  /* One break per task: a second tap used to append a whole duplicate
     set of steps (PACE-008). The button hides once steps exist; this
     guard covers a fast double-tap before the hide lands. */
  if (t.steps && t.steps.length) { toast(tr("This one already has its steps.")); return; }
  t.steps = L.decompose(t.title, t.durationMin, true);
  save(); renderSteps(t); refreshAll(); toast(tr("Broken down. Only the first step matters right now."));
});
function persistSheetFields() {
  var t = baseTask(currentTaskId); if (!t) return;
  // Teaching (or re-teaching) the smallest version is a Plus
  // act; USING a taught version on a low day stays free. A
  // refused teach keeps the version already taught.
  var taught = $("dMin").value.trim();
  if (taught !== (t.minVersion || "") && !plusGate("steps")) taught = t.minVersion || "";
  t.minVersion = taught;
  t.fullVersion = $("dFull").value.trim();
  t.notes = $("dNotes").value.trim();
  t.link = cleanUrl($("dLink").value);
  t.time = $("dTime").value || null;
  if (t.time) t.allDay = false;
  t.durationMin = Math.max(5, +$("dDur").value || t.durationMin);
  t.essential = $("dEssential").checked;
  var newDate = $("dDate").value;
  if (newDate && newDate !== currentInstanceDate) {
    moveInstance(t, currentInstanceDate, newDate);
    currentInstanceDate = newDate;
  }
  save();
}
["dMin", "dFull", "dTime", "dDur", "dEssential", "dDate"].forEach(function (id) {
  $(id).addEventListener("change", function () { persistSheetFields(); refreshAll(); });
});
$("dClose").addEventListener("click", function () { stopTaskAudio(); persistSheetFields(); $("taskSheet").hidden = true; refreshAll(); });
$("dDone").addEventListener("click", function () { stopTaskAudio(); persistSheetFields(); toggleDone(currentTaskId, currentInstanceDate); $("taskSheet").hidden = true; });
$("dDoing").addEventListener("click", function () {
  var t = baseTask(currentTaskId); if (!t) return;
  stopTaskAudio();
  persistSheetFields();
  if (t.repeat) { t.doneDates = (t.doneDates || []).filter(function (d) { return d !== currentInstanceDate; }); }
  t.status = "doing"; save(); $("taskSheet").hidden = true; refreshAll(); toast(tr("Doing. One step at a time."));
});
$("dNotToday").addEventListener("click", function () {
  var t = baseTask(currentTaskId); if (!t) return;
  stopTaskAudio();
  persistSheetFields();
  moveInstance(t, currentInstanceDate, L.addDays(currentInstanceDate, 1));
  save(); $("taskSheet").hidden = true; refreshAll();
  toast(tr("Moved to tomorrow. That counts as handling it."));
});
$("dDelete").addEventListener("click", function () {
  var t = baseTask(currentTaskId); if (!t) return;
  stopTaskAudio();
  if (t.repeat) {
    t.skipDates = t.skipDates || [];
    if (t.skipDates.indexOf(currentInstanceDate) === -1) t.skipDates.push(currentInstanceDate);
    toast(tr("Removed for this day. The rest of the series stays."), function () {
      t.skipDates = t.skipDates.filter(function (d) { return d !== currentInstanceDate; });
      save(); refreshAll(); toast(tr("Back again."));
    });
  } else {
    var taskIdx = state.tasks.indexOf(t);
    state.tasks = state.tasks.filter(function (x) { return x.id !== currentTaskId; });
    toast(tr("Deleted."), function () { restoreAt(state.tasks, t, taskIdx); save(); refreshAll(); toast(tr("Back again.")); });
  }
  save(); $("taskSheet").hidden = true; refreshAll();
});

/* ---------- capture ---------- */
$("parseBtn").addEventListener("click", function () {
  if (!plusGate("talk")) return;
  var text = $("dumpText").value;
  drafts = L.parseDump(text, L.todayKey());
  if (!drafts.length) { $("captureMsg").textContent = tr("Nothing I could sort yet. Try one thing per line, like: call the dentist tomorrow at 3pm."); return; }
  $("captureMsg").textContent = "";
  renderDrafts(text);
});
function renderDrafts(original) {
  $("draftArea").hidden = false;
  $("originalText").textContent = original;
  var box = $("draftList"); box.innerHTML = "";
  drafts.forEach(function (d, i) {
    var card = document.createElement("div");
    card.className = "draft-card";
    card.innerHTML = '<span class="tr-dot" style="background:' + d.color + '"></span><div style="flex:1">' +
      '<input type="text" data-f="title" value="' + esc(d.title) + '">' +
      '<div class="dc-meta"><input type="date" data-f="date" value="' + d.date + '"><input type="time" data-f="time" value="' + (d.time || "") + '"><input type="number" data-f="durationMin" value="' + d.durationMin + '" min="5" step="5" style="width:76px"><span class="hint">' + tr("min") + '</span>' +
      (d.repeat ? '<span class="hint">' + esc(tr(d.repeat)) + "</span>" : "") + (d.essential ? '<span class="hint">' + tr("must not slip") + '</span>' : "") + "</div>" +
      (d.steps && d.steps.length ? '<ol class="dc-steps">' + d.steps.map(function (s) { return "<li>" + esc(s.text) + "</li>"; }).join("") + "</ol>" : "") +
      '</div><button class="dc-del" data-del="' + i + '">' + tr("Remove") + '</button>';
    card.querySelectorAll("[data-f]").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var f = inp.getAttribute("data-f");
        if (f === "durationMin") drafts[i].durationMin = Math.max(5, +inp.value || 25);
        else if (f === "time") drafts[i].time = inp.value || null;
        else drafts[i][f] = inp.value;
      });
    });
    card.querySelector("[data-del]").addEventListener("click", function () { drafts.splice(i, 1); renderDrafts(original); });
    box.appendChild(card);
  });
}
$("draftClear").addEventListener("click", function () { drafts = []; $("draftArea").hidden = true; $("dumpText").value = ""; });
$("draftAddAll").addEventListener("click", function () {
  var original = $("dumpText").value;
  drafts.forEach(function (d) {
    state.tasks.push({ id: uid(), title: d.title, date: d.date, time: d.time, durationMin: d.durationMin, priority: d.priority, repeat: d.repeat, category: d.category, color: d.color, essential: d.essential, status: "todo", steps: d.steps || [], minVersion: "", fullVersion: "", source: "capture", originalText: original, skipDates: [], doneDates: [] });
  });
  save(); if (drafts.length) markActivated("event");
  var n = drafts.length;
  drafts = []; $("draftArea").hidden = true; $("dumpText").value = "";
  showPanel("calendar"); selectDate(L.todayKey(), true); refreshAll();
  toast(tr(n === 1 ? "{n} thing sorted onto your calendar." : "{n} things sorted onto your calendar.", { n: n }));
});
$("journalFile").addEventListener("change", function (e) {
  var f = e.target.files[0]; if (!f) return;
  var r = new FileReader();
  r.onload = function () { $("dumpText").value = String(r.result || ""); $("captureMsg").textContent = tr("Journal loaded. Tap Make my list when you are ready."); };
  r.readAsText(f);
});
/* Voice engine: ONE engine for every Speak button. In the store app it
   uses the device recogniser (Capacitor SpeechRecognition plugin —
   the WebView offers no web speech of its own, which is why dictation
   "did not work at all" there). In a browser it uses Web Speech with
   live words while you talk. Errors say what actually went wrong.
   Typing always works exactly the same. */
var taskAudioSession = null;
var taskAudioTaskId = null;
var taskAudioTimer = null;
function renderTaskAudio(task) {
  var player = $("dAudioPlayer"), note = task && task.audioNote;
  var hasNote = !!(note && typeof note.dataUrl === "string");
  var valid = !!(hasNote && note.dataUrl.length <= window.PaceAudioNotes.MAX_AUDIO_NOTE_CHARS && /^data:audio\/[^;,]+(?:;[^,]*)*;base64,/i.test(note.dataUrl));
  if (player) {
    try { player.pause(); } catch (e) {}
    player.removeAttribute("src");
    player.hidden = !valid;
    if (valid) { player.src = note.dataUrl; player.load(); }
  }
  $("dAudioDelete").hidden = !hasNote;
  $("dAudioStart").hidden = !!(taskAudioSession && taskAudioTaskId === task.id);
  $("dAudioStop").hidden = !(taskAudioSession && taskAudioTaskId === task.id);
  $("dAudioStop").disabled = false;
  $("dAudioStatus").textContent = valid
    ? tr("Audio note saved ({seconds} seconds).", { seconds: Math.max(1, Math.round((+note.durationMs || 0) / 1000)) })
    : hasNote ? tr("This audio note cannot be played.") : tr("No audio note saved yet.");
}
function stopTaskAudio(message) {
  if (!taskAudioSession) return;
  clearTimeout(taskAudioTimer); taskAudioTimer = null;
  $("dAudioStop").disabled = true;
  $("dAudioStatus").textContent = message || tr("Saving recording.");
  taskAudioSession.stop();
}
function finishTaskAudio(session) {
  if (taskAudioSession !== session) return;
  clearTimeout(taskAudioTimer); taskAudioTimer = null;
  var taskId = taskAudioTaskId;
  taskAudioSession = null; taskAudioTaskId = null;
  if (currentTaskId === taskId) {
    var task = baseTask(taskId);
    if (task) renderTaskAudio(task);
  }
}
function failTaskAudio(session, error) {
  if (taskAudioSession !== session) return;
  var taskId = taskAudioTaskId;
  var denied = error && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError" || /denied|permission/i.test(error.message || ""));
  finishTaskAudio(session);
  if (currentTaskId === taskId) $("dAudioStatus").textContent = denied
    ? tr("Microphone access is blocked. Allow it, then try recording again.")
    : tr("Audio recording did not work. Try again, or type a note instead.");
}
async function saveTaskAudio(session, result) {
  if (taskAudioSession !== session) return;
  var taskId = taskAudioTaskId, task = baseTask(taskId);
  if (!task) { finishTaskAudio(session); return; }
  try {
    var dataUrl = await window.PaceAudioNotes.toDataUrl(result.blob);
    if (dataUrl.length > window.PaceAudioNotes.MAX_AUDIO_NOTE_CHARS) {
      finishTaskAudio(session);
      if (currentTaskId === taskId) $("dAudioStatus").textContent = tr("This recording is too large. Try a shorter note.");
      return;
    }
    var note = { dataUrl: dataUrl, mimeType: result.mimeType, durationMs: result.durationMs, savedAt: new Date().toISOString() };
    if (!window.PaceAudioNotes.fitsInState(state, taskId, note)) {
      finishTaskAudio(session);
      if (currentTaskId === taskId) $("dAudioStatus").textContent = tr("This audio note would make your saved calendar too large to sync. Remove an older audio note or record a shorter one.");
      return;
    }
    task.audioNote = note;
    save();
    finishTaskAudio(session);
    if (currentTaskId === taskId) renderTaskAudio(task);
    toast(tr("Audio note saved ({seconds} seconds).", { seconds: Math.max(1, Math.round((+result.durationMs || 0) / 1000)) }));
  } catch (error) {
    finishTaskAudio(session);
    if (currentTaskId === taskId) $("dAudioStatus").textContent = tr("Audio note could not be saved. Nothing changed.");
  }
}
function startTaskAudio() {
  if (taskAudioSession) return;
  var task = baseTask(currentTaskId);
  if (!task) return;
  if (!window.PaceAudioNotes || !window.MediaRecorder) {
    $("dAudioStatus").textContent = tr("Audio recording is not available in this browser. Typing works the same.");
    return;
  }
  var session;
  try { session = window.PaceAudioNotes.start(); }
  catch (error) {
    $("dAudioStatus").textContent = error && error.message === "microphone-unavailable"
      ? tr("Audio recording is not available in this browser. Typing works the same.")
      : tr("Audio recording did not work. Try again, or type a note instead.");
    return;
  }
  taskAudioSession = session; taskAudioTaskId = task.id;
  $("dAudioStart").hidden = true; $("dAudioStop").hidden = false; $("dAudioStop").disabled = false;
  $("dAudioStatus").textContent = tr("Allow microphone access if asked.");
  session.ready.then(function () {
    if (taskAudioSession !== session) return;
    $("dAudioStatus").textContent = tr("Recording. {seconds} seconds left.", { seconds: Math.ceil(window.PaceAudioNotes.MAX_RECORDING_MS / 1000) });
    taskAudioTimer = setTimeout(function () {
      if (taskAudioSession === session) stopTaskAudio(tr("Recording limit reached. Saving now."));
    }, window.PaceAudioNotes.MAX_RECORDING_MS);
  }, function () {});
  session.done.then(function (result) { return saveTaskAudio(session, result); }, function (error) { failTaskAudio(session, error); });
}
$("dAudioStart").addEventListener("click", startTaskAudio);
$("dAudioStop").addEventListener("click", function () { stopTaskAudio(); });
$("dAudioDelete").addEventListener("click", function () {
  var task = baseTask(currentTaskId); if (!task || !task.audioNote) return;
  var saved = task.audioNote;
  delete task.audioNote; save(); renderTaskAudio(task);
  toast(tr("Audio note removed."), function () { task.audioNote = saved; save(); renderTaskAudio(task); });
});
window.addEventListener("beforeunload", function () { if (taskAudioSession) taskAudioSession.cancel(); });

var voiceSession = null;
function voiceErrorText(code) {
  if (code === "not-allowed" || code === "service-not-allowed") return tr("The microphone is blocked. Allow the mic for Pace, then tap Speak again. Typing works the same.");
  if (code === "audio-capture") return tr("No microphone could be found. Typing works the same.");
  if (code === "no-speech") return tr("I did not hear anything. Try again, a little closer. Typing works the same.");
  if (code === "network") return tr("Voice typing needs the internet on this device. Typing works the same.");
  if (code === "aborted") return "";
  return tr("Voice did not come through. Typing works the same.");
}
function nativeSpeech() {
  try {
    var C = window.Capacitor;
    if (C && typeof C.isNativePlatform === "function" && C.isNativePlatform() && C.Plugins && C.Plugins.SpeechRecognition) return C.Plugins.SpeechRecognition;
  } catch (e) {}
  return null;
}
/* hooks: { msg(text), final(text), btn } — final fires per finished phrase. */
function toggleVoice(hooks) {
  if (voiceSession) { voiceSession.stop(); return; }
  var btn = hooks.btn, span = btn.querySelector("span");
  var done = function () { voiceSession = null; if (span) span.textContent = tr(hooks.label || "Speak"); };
  var nat = nativeSpeech();
  if (!nat) {
    // POLAR P1 hardening (21 Oct): on the packaged app with the
    // speech plugin missing from the build (build 20's conveyor
    // hole — the plugin was named in config but never compiled
    // in), the flow used to fall through to the WebView's web
    // speech, which errors not-allowed and accuses the user's
    // mic settings — wrongly. On native, no plugin means the
    // BUILD lacks voice: say that, honestly, and stop.
    var C2 = window.Capacitor;
    if (C2 && typeof C2.isNativePlatform === "function" && C2.isNativePlatform()) { hooks.msg(tr("Voice is not in this build of the app. Typing works the same — your words land in the same place.")); return; }
  }
  if (nat) {
    var stopped = false;
    voiceSession = { stop: function () { stopped = true; try { nat.stop(); } catch (e) {} done(); } };
    if (span) span.textContent = tr("Stop");
    hooks.msg("Listening… talk away, then tap Stop.");
    nat.requestPermissions().then(function (perm) {
      if (perm && perm.speechRecognition && perm.speechRecognition !== "granted") { hooks.msg(voiceErrorText("not-allowed")); done(); return null; }
      var partialH = null;
      if (typeof nat.addListener === "function") {
        nat.addListener("partialResults", function (d) { if (!stopped && d && d.matches && d.matches[0]) hooks.msg("Listening… " + d.matches[0]); }).then(function (h) { partialH = h; });
      }
      return nat.start({ language: "en-AU", partialResults: true, popup: false, maxResults: 1 }).then(function (res) {
        if (partialH && partialH.remove) partialH.remove();
        var said = res && res.matches && res.matches[0] ? String(res.matches[0]).trim() : "";
        if (said) hooks.final(said); else if (!stopped) hooks.msg(voiceErrorText("no-speech"));
        done();
      });
    }).catch(function () { if (!stopped) hooks.msg(voiceErrorText("")); done(); });
    return;
  }
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { hooks.msg("Voice is not offered by this browser. Typing in the box works exactly the same."); return; }
  var rec = new SR();
  rec.lang = "en-AU"; rec.interimResults = true; rec.continuous = true;
  var heardFinal = false;
  voiceSession = { stop: function () { try { rec.stop(); } catch (e) {} } };
  if (span) span.textContent = tr("Stop");
  hooks.msg("Listening… talk away, then tap Stop.");
  rec.onresult = function (ev) {
    var interim = "";
    for (var i = ev.resultIndex; i < ev.results.length; i++) {
      var r = ev.results[i], txt = r[0].transcript;
      if (r.isFinal) { var t = txt.trim(); if (t) { heardFinal = true; hooks.final(t); } }
      else interim += txt;
    }
    /* Once a final has landed, the message belongs to the final hook
       (the "check the words" nudge) — interim previews must not stomp
       it (QA v13 audit note 3). */
    if (!heardFinal && interim.trim()) hooks.msg("Listening… " + interim.trim());
  };
  rec.onerror = function (ev) { var m = voiceErrorText(ev && ev.error); if (m) hooks.msg(m); };
  rec.onend = function () { done(); };
  try { rec.start(); } catch (e) { hooks.msg(voiceErrorText("")); done(); }
}
$("voiceBtn").addEventListener("click", function () {
  toggleVoice({
    btn: $("voiceBtn"),
    msg: function (t) { $("captureMsg").textContent = t; },
    final: function (said) {
      $("dumpText").value = ($("dumpText").value ? $("dumpText").value + "\n" : "") + said;
      $("captureMsg").textContent = tr("Got it. Check the words, then tap Make my list.");
    }
  });
});
$("dNotesSpeak").addEventListener("click", function () {
  toggleVoice({
    btn: $("dNotesSpeak"),
    label: "Speak note",
    msg: function (text) { $("dNotesStatus").textContent = text; },
    final: function (said) {
      $("dNotes").value = ($("dNotes").value.trim() ? $("dNotes").value.trim() + "\n" : "") + said;
      persistSheetFields();
      $("dNotesStatus").textContent = tr("Got it. Check your note.");
    }
  });
});
$("dNotes").addEventListener("change", function () { persistSheetFields(); });
/* Handwriting photo: OCR runs on-device with the Tesseract.js copy bundled
   in vendor/tesseract (worker, LSTM core and English data are local too).
   Shared by Talk to it and To do; onText receives the words found. */
/* In the store build, bundletool stores the language file decompressed as
   eng.traineddata (it strips .gz); on the web the .gz is served as-is.
   gzip:false makes Tesseract ask for the raw name the bundle carries. */
var OCR_IN_APP = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform());
var OCR_OPTIONS = {
  workerPath: "vendor/tesseract/worker.min.js",
  corePath: "vendor/tesseract/core",
  langPath: "vendor/tesseract/lang",
  cacheMethod: "none",
  gzip: !OCR_IN_APP
};
function ocrPhoto(f, msgEl, onText) {
  msgEl.textContent = tr("Reading your photo. This can take a little while the first time.");
  if (!window.Tesseract) {
    msgEl.textContent = tr("The reading tool did not load. Typing or speaking works the same.");
    return;
  }
  window.Tesseract.recognize(f, "eng", OCR_OPTIONS).then(function (res) {
    var text = (res && res.data && res.data.text || "").trim();
    if (text) onText(text);
    else msgEl.textContent = tr("I could not read words in that photo. Typing or speaking works the same.");
  }).catch(function () { msgEl.textContent = tr("Reading the photo did not work this time. Typing or speaking works the same."); });
}
$("photoFile").addEventListener("change", function (e) {
  var f = e.target.files[0]; if (!f) return;
  ocrPhoto(f, $("captureMsg"), function (text) {
    $("dumpText").value = ($("dumpText").value ? $("dumpText").value + "\n" : "") + text;
    $("captureMsg").textContent = tr("Here is what I could read. Fix any words, then tap Make my list.");
  });
});

/* ---------- to do: a fast list that lives happily beside the calendar ---------- */
function addTodo(text) {
  text = (text || "").trim();
  if (!text) return null;
  var item = { id: uid(), text: text, done: false, calTaskId: null };
  state.todos.unshift(item);
  return item;
}
function todoLinked(item) {
  return !!(item.calTaskId && state.tasks.some(function (t) { return t.id === item.calTaskId; }));
}
/* Next free slot today: after now (and after wake time), before wind-down, clear of every timed task. */
function nextFreeSlot(dur, key) {
  key = key || L.todayKey();
  var st = state.settings || {}, now = new Date();
  var from = L.toMin(st.wakeTime || "07:00"), to = L.toMin(st.windTime || "22:00");
  if (key === L.todayKey()) from = Math.max(from, Math.ceil((now.getHours() * 60 + now.getMinutes() + 5) / 15) * 15);
  var busy = tasksOn(key).filter(function (t) { return t.time && t.status !== "done"; }).map(function (t) { var b = L.toMin(t.time); return [b, b + (t.durationMin || 25)]; }).sort(function (x, y) { return x[0] - y[0]; });
  var at = from;
  for (var i = 0; i < busy.length; i++) { if (busy[i][1] <= at) continue; if (busy[i][0] >= at + dur) break; at = Math.ceil(busy[i][1] / 5) * 5; }
  if (at + dur > to) return null;
  return L.pad(Math.floor(at / 60)) + ":" + L.pad(at % 60);
}
var ICON_WORDS = [
  [/\b(call|phone|ring)\b/, "\u260e\ufe0f"], [/\b(email|mail|message|text|reply|dm)\b/, "\u2709\ufe0f"],
  [/\b(meet|meeting|standup|zoom|interview)\b/, "\ud83d\udc65"], [/\b(gym|workout|run|walk|exercise|yoga|swim|stretch)\b/, "\ud83c\udfcb\ufe0f"],
  [/\b(eat|lunch|dinner|breakfast|cook|meal|snack)\b/, "\ud83c\udf7d\ufe0f"], [/\b(buy|shop|shopping|groceries|order)\b/, "\ud83d\uded2"],
  [/\b(study|read|homework|exam|class|learn)\b/, "\ud83d\udcda"], [/\b(write|report|essay|draft|plan|prep)\b/, "\u270f\ufe0f"],
  [/\b(doctor|dentist|medicine|pills|appointment|therapy)\b/, "\ud83e\ude7a"], [/\b(clean|tidy|laundry|dishes|vacuum)\b/, "\ud83e\uddf9"],
  [/\b(pay|rent|bill|invoice|tax|bank)\b/, "\ud83d\udcb3"], [/\b(sleep|nap|rest|bed)\b/, "\ud83c\udf19"],
  [/\b(drive|car|flight|travel|trip|pack)\b/, "\ud83d\ude97"], [/\b(kid|school|pickup|mum|dad|family)\b/, "\ud83c\udfe0"]
];
function taskEmoji(title) { var t = String(title || "").toLowerCase(); for (var i = 0; i < ICON_WORDS.length; i++) if (ICON_WORDS[i][0].test(t)) return ICON_WORDS[i][1]; return ""; }
function planTodosIntoDay() {
  var n = 0;
  state.todos.forEach(function (item) { if (item.done || todoLinked(item)) return; if (linkTodo(item)) n++; });
  return n;
}
function linkTodo(item) {
  if (todoLinked(item)) return false;
  var cat = L.categoryFor(item.text);
  var slotDur = Math.min(L.estimateDuration ? L.estimateDuration(item.text) : 15, 45) || 15; var slotAt = nextFreeSlot(slotDur);
  var task = { id: uid(), title: item.text, date: L.todayKey(), time: slotAt, durationMin: slotDur, priority: 0, repeat: null, category: cat.id, color: cat.color, essential: false, status: "todo", steps: L.decompose(item.text, 25, false), minVersion: "", fullVersion: "", source: "todo", originalText: "", skipDates: [], doneDates: [] };
  state.tasks.push(task);
  item.calTaskId = task.id;
  markActivated("event");
  return true;
}
function renderTodos() {
  var wrap = $("todoList"); if (!wrap) return;
  wrap.innerHTML = "";
  if (!state.todos.length) wrap.innerHTML = '<div class="empty-note">' + icon("i-todo") + "<span>" + tr("Nothing here. Write one fast, above.") + "</span></div>";
  state.todos.forEach(function (item) {
    var row = document.createElement("div");
    row.className = "todo-row" + (item.done ? " is-done" : "");
    row.setAttribute("data-id", item.id);
    row.draggable = true;
    row.addEventListener("dragstart", function (e) { row.classList.add("dragging"); e.dataTransfer.setData("text/plain", "todo:" + item.id); });
    row.addEventListener("dragend", function () { row.classList.remove("dragging"); });
    row.addEventListener("dragover", function (e) { e.preventDefault(); row.classList.add("drop-target"); });
    row.addEventListener("dragleave", function () { row.classList.remove("drop-target"); });
    row.addEventListener("drop", function (e) {
      e.preventDefault(); row.classList.remove("drop-target");
      var raw = e.dataTransfer.getData("text/plain") || "";
      if (raw.indexOf("todo:") !== 0) return;
      var from = state.todos.findIndex(function (t) { return t.id === raw.slice(5); }), to = state.todos.indexOf(item);
      if (from < 0 || to < 0 || from === to) return;
      state.todos.splice(to, 0, state.todos.splice(from, 1)[0]);
      save(); renderTodos();
    });
    row.innerHTML =
      '<button class="todo-grip" data-act="grip" type="button" aria-label="Hold and drag to reorder">&#8942;&#8942;</button>' +
      '<button class="todo-tick" data-act="tick" aria-label="' + tr("Mark done") + '">' + (item.done ? icon("i-check") : "") + "</button>" +
      '<span class="todo-text"></span>' +
      '<button class="todo-cal' + (todoLinked(item) ? " is-on" : "") + '" data-act="cal" aria-label="' + tr("Put on the calendar") + '" title="' + tr("Put on the calendar") + '">' + icon("i-calplus") + "</button>" +
      '<button class="todo-del" data-act="del" aria-label="' + tr("Delete") + '">' + icon("i-trash") + "</button>";
    var emoT = taskEmoji(item.text); row.querySelector(".todo-text").textContent = (emoT ? emoT + " " : "") + item.text;
    var grip = row.querySelector(".todo-grip");
    grip.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      var startY = e.clientY, target = null;
      try { grip.setPointerCapture(e.pointerId); } catch (x) {}
      row.classList.add("is-lifted");
      function mv(ev) {
        row.style.transform = "translateY(" + (ev.clientY - startY) + "px)"; row.style.pointerEvents = "none";
        var el = document.elementFromPoint(ev.clientX, ev.clientY), r = el && el.closest ? el.closest(".todo-row") : null;
        [].slice.call(wrap.querySelectorAll(".drop-target")).forEach(function (n) { n.classList.remove("drop-target"); });
        target = (r && r !== row) ? r : null; if (target) target.classList.add("drop-target");
      }
      function up() {
        grip.removeEventListener("pointermove", mv); grip.removeEventListener("pointerup", up); grip.removeEventListener("pointercancel", up);
        row.style.transform = ""; row.style.pointerEvents = ""; row.classList.remove("is-lifted");
        if (target) {
          var from = state.todos.indexOf(item), to = state.todos.findIndex(function (t) { return t.id === target.getAttribute("data-id"); });
          if (from >= 0 && to >= 0 && from !== to) { state.todos.splice(to, 0, state.todos.splice(from, 1)[0]); save(); }
        }
        renderTodos();
      }
      grip.addEventListener("pointermove", mv); grip.addEventListener("pointerup", up); grip.addEventListener("pointercancel", up);
    });
    row.querySelectorAll("button").forEach(function (b) {
      b.addEventListener("click", function () {
        var act = b.getAttribute("data-act");
        if (act === "tick") { item.done = !item.done; save(); renderTodos(); }
        else if (act === "del") { var todoIdx = state.todos.indexOf(item); state.todos = state.todos.filter(function (t) { return t.id !== item.id; }); save(); renderTodos(); toast(tr("Deleted."), function () { restoreAt(state.todos, item, todoIdx); save(); renderTodos(); toast(tr("Back again.")); }); }
        else if (act === "cal") {
          if (todoLinked(item)) {
            var linked = baseTask(item.calTaskId); var linkedIdx = linked ? state.tasks.indexOf(linked) : -1;
            state.tasks = state.tasks.filter(function (t) { return t.id !== item.calTaskId; });
            item.calTaskId = null; save(); refreshAll();
            toast(tr("Off the calendar. Still on your list."), linked ? function () { restoreAt(state.tasks, linked, linkedIdx); item.calTaskId = linked.id; save(); refreshAll(); toast(tr("Back again.")); } : undefined);
          } else if (linkTodo(item)) { save(); refreshAll(); var lt0 = baseTask(item.calTaskId); toast(lt0 && lt0.time ? tr("On today's calendar at {time}.", { time: lt0.time }) : tr("On today's calendar.")); }
        }
      });
    });
    wrap.appendChild(row);
  });
  $("todoClearDone").hidden = !state.todos.some(function (t) { return t.done; });
  var pb = $("todoPlanDay");
  if (!pb) { pb = document.createElement("button"); pb.id = "todoPlanDay"; pb.type = "button"; pb.className = "soft-btn plan-day-btn"; $("todoList").parentNode.insertBefore(pb, $("todoList")); pb.addEventListener("click", function () { var k = planTodosIntoDay(); save(); refreshAll(); renderTodos(); toast(k ? tr("Put {n} on today's calendar, in free spots.", { n: k }) : tr("Nothing left to place.")); }); }
  var left = state.todos.filter(function (t) { return !t.done && !todoLinked(t); }).length;
  pb.hidden = !left; pb.textContent = tr("Plan my day: put {n} in free spots", { n: left });
}
function submitTodoInput() {
  if (addTodo($("todoInput").value)) { $("todoInput").value = ""; save(); renderTodos(); }
  // POLAR P4: a blank add was a silent no-op — say so.
  else toast(tr("Type the thing first, then tap +."));
}
$("todoAddBtn").addEventListener("click", submitTodoInput);
$("todoInput").addEventListener("keydown", function (e) { if (e.key === "Enter") submitTodoInput(); });
$("todoClearDone").addEventListener("click", function () {
  var cleared = []; state.todos.forEach(function (t, i) { if (t.done) cleared.push([t, i]); });
  state.todos = state.todos.filter(function (t) { return !t.done; });
  save(); renderTodos();
  toast(tr("Done list cleared."), function () { cleared.forEach(function (p) { restoreAt(state.todos, p[0], p[1]); }); save(); renderTodos(); toast(tr("Back again.")); });
});
$("todoCalAll").addEventListener("click", function () {
  var n = 0;
  state.todos.forEach(function (item) { if (!item.done && linkTodo(item)) n++; });
  save(); refreshAll();
  toast(n ? tr(n === 1 ? "{n} item on today's calendar." : "{n} items on today's calendar.", { n: n }) : tr("Everything is already on the calendar."));
});
$("todoVoiceBtn").addEventListener("click", function () {
  toggleVoice({
    btn: $("todoVoiceBtn"),
    msg: function (t) { $("todoMsg").textContent = t; },
    final: function (said) { if (addTodo(said)) { save(); renderTodos(); toast(tr("Added: {x}", { x: said })); } }
  });
});
$("todoPhoto").addEventListener("change", function (e) {
  var f = e.target.files[0]; if (!f) return;
  ocrPhoto(f, $("todoMsg"), function (text) {
    var lines = text.split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (!lines.length) { $("todoMsg").textContent = tr("I could not read a list in that photo."); return; }
    var list = $("todoDraftList"); list.innerHTML = "";
    lines.forEach(function (line) {
      var lab = document.createElement("label");
      lab.className = "todo-draft-line";
      var cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = true; cb.value = line;
      var sp = document.createElement("span"); sp.textContent = line;
      lab.appendChild(cb); lab.appendChild(sp); list.appendChild(lab);
    });
    $("todoDraftArea").hidden = false;
    $("todoMsg").textContent = "Here is what I could read. Untick anything that is not a to-do.";
  });
});
$("todoDraftAdd").addEventListener("click", function () {
  var n = 0;
  $("todoDraftList").querySelectorAll("input[type=checkbox]:checked").forEach(function (cb) { if (addTodo(cb.value)) n++; });
  $("todoDraftArea").hidden = true;
  save(); renderTodos();
  toast(n ? tr(n === 1 ? "{n} to-do added." : "{n} to-dos added.", { n: n }) : tr("Nothing ticked, nothing added."));
});
$("todoDraftClear").addEventListener("click", function () { $("todoDraftArea").hidden = true; });

/* ---------- habits: an icon, a tick, a run of dots ---------- */
function habitIconId(key) { return key === "heart" ? "i-heart" : "i-h-" + key; }
var habitPick = "star";
function renderIconPicker() {
  var wrap = $("habitIcons"); if (!wrap) return;
  wrap.innerHTML = "";
  L.HABIT_ICONS.forEach(function (key) {
    var b = document.createElement("button");
    b.className = "icon-pick" + (key === habitPick ? " is-on" : "");
    b.setAttribute("aria-label", "Icon: " + key);
    b.innerHTML = icon(habitIconId(key));
    b.addEventListener("click", function () { habitPick = key; renderIconPicker(); });
    wrap.appendChild(b);
  });
}
function renderHabits() { if (window.PaceGoalsUI) window.PaceGoalsUI.renderHabits(); renderIconPicker(); }
function submitHabit() {
  var name = $("habitName").value.trim();
  if (!name) { toast(tr("Give the habit a name first.")); return; }
  var hab = { id: uid(), name: name, icon: habitPick, days: {}, plan: ($("habitPlan") ? $("habitPlan").value.trim() : ""), tiny: ($("habitTiny") ? $("habitTiny").value.trim() : "") };
  var hTime = $("habitTime") ? $("habitTime").value : "";
  if (/^\d{2}:\d{2}$/.test(hTime)) {
    /* A habit with a time lives on the calendar every day, with its own reminder; ticking either one ticks both. */
    var hc = L.categoryFor(name), ht = { id: uid(), title: name, date: L.todayKey(), time: hTime, durationMin: 10, priority: 0, repeat: "every day", category: hc.id, color: hc.color, status: "todo", source: "habit", habitId: hab.id, skipDates: [], doneDates: [], originalText: name };
    if (hab.tiny) ht.minVersion = hab.tiny;
    try { ht.remind = cleanLeads(defaultLeads()); } catch (e) {}
    state.tasks.push(ht); hab.time = hTime; hab.taskId = ht.id;
  }
  state.habits.push(hab);
  $("habitName").value = ""; if ($("habitTime")) $("habitTime").value = ""; if ($("habitPlan")) $("habitPlan").value = ""; if ($("habitTiny")) $("habitTiny").value = "";
  save(); renderHabits(); refreshAll();
}
$("habitAddBtn").addEventListener("click", submitHabit);
$("habitName").addEventListener("keydown", function (e) { if (e.key === "Enter") submitHabit(); });

/* ---------- progress board ---------- */
function renderProgress() {
  var all = state.tasks;
  var doneCount = all.filter(function (t) { return t.status === "done" || (t.doneDates || []).length; }).length;
  var todayAd = adaptedFor(L.todayKey());
  var ts = L.dayScore(todayAd);
  $("progressSummary").innerHTML =
    "<div><strong>" + tr("{a} of {b}", { a: ts.done, b: ts.total }) + "</strong>" + tr("done today, at your pace") + "</div>" +
    "<div><strong>" + all.filter(function (t) { return t.status === "doing"; }).length + "</strong>" + tr("in progress") + "</div>" +
    "<div><strong>" + all.filter(function (t) { return t.status !== "done"; }).length + "</strong>" + tr("still on the list, all safe") + "</div>" +
    "<div><strong>" + doneCount + "</strong>" + tr("things finished, counted forever") + "</div>";
  ["todo", "doing", "done"].forEach(function (status) {
    var col = $("col-" + status); col.innerHTML = "";
    var list = all.filter(function (t) { return t.status === status; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!list.length) col.innerHTML = '<p class="hint">' + tr("Nothing here right now.") + '</p>';
    list.forEach(function (t) {
      var card = document.createElement("div");
      card.className = "p-card"; card.draggable = true; card.setAttribute("data-pid", t.id);
      card.innerHTML = '<span class="pc-title">' + esc(t.title) + '</span><span class="pc-meta"><span class="tr-dot" style="background:' + t.color + '"></span>' +
        esc(L.parseKey(t.date).toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short" })) + (t.time ? " · " + t.time : "") + " · " + (t.allDay ? tr("All day") : tr("{n} min", { n: t.durationMin })) + (t.repeat ? " · " + esc(t(t.repeat)) : "") + "</span>";
      card.addEventListener("click", function () { openTask(t.id, t.date); });
      card.addEventListener("dragstart", function (e) { e.dataTransfer.setData("text/plain", t.id); });
      col.appendChild(card);
    });
  });
}
document.querySelectorAll(".board-col").forEach(function (col) {
  col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("drag-over"); });
  col.addEventListener("dragleave", function () { col.classList.remove("drag-over"); });
  col.addEventListener("drop", function (e) {
    e.preventDefault(); col.classList.remove("drag-over");
    var t = baseTask(e.dataTransfer.getData("text/plain")); if (!t) return;
    t.status = col.getAttribute("data-status");
    if (t.status === "done") toast(tr("Done. That counts."));
    save(); renderProgress(); refreshAll();
  });
});
/* Dragging a day-list row onto a DayTicker day moves the task to that day.
   Both live in the Calendar panel, so the drag never crosses panels. */
$("dayList").addEventListener("dragstart", function (e) {
  var row = e.target.closest ? e.target.closest(".task-row") : null;
  if (!row) return;
  row.classList.add("dragging");
  e.dataTransfer.setData("text/plain", JSON.stringify({ id: row.getAttribute("data-id"), date: row.getAttribute("data-date") }));
});
$("dayList").addEventListener("dragend", function () {
  $("dayList").querySelectorAll(".dragging").forEach(function (r) { r.classList.remove("dragging"); });
});
/* Drop a day-list row on another row of the same day to reorder it. */
function moveDayTaskTo(id, key, targetId) {
  if (!id || !targetId || id === targetId) return false;
  var ad = adaptedFor(key);
  var group = ad.visible.some(function (t) { return t.id === id; }) ? ad.visible : ad.done;
  var ids = group.map(function (t) { return t.id; });
  var from = ids.indexOf(id), to = ids.indexOf(targetId);
  if (from < 0 || to < 0) return false;
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  var other = group === ad.visible ? ad.done : ad.visible;
  state.dayOrder[key] = ids.concat(other.map(function (t) { return t.id; }));
  save(); refreshAll();
  return true;
}
(function bindDayListDrop() {
  var list = $("dayList");
  function clear() { list.querySelectorAll(".drop-target").forEach(function (r) { r.classList.remove("drop-target"); }); }
  list.addEventListener("dragover", function (e) {
    var row = e.target.closest ? e.target.closest(".task-row") : null;
    if (!row) return;
    e.preventDefault(); clear(); row.classList.add("drop-target");
  });
  list.addEventListener("dragleave", function (e) { if (e.target === list) clear(); });
  list.addEventListener("drop", function (e) {
    var row = e.target.closest ? e.target.closest(".task-row") : null;
    clear();
    if (!row) return;
    var info; try { info = JSON.parse(e.dataTransfer.getData("text/plain") || "null"); } catch (err) { return; }
    if (!info || !info.id || info.date !== row.getAttribute("data-date")) return;
    e.preventDefault();
    if (moveDayTaskTo(info.id, info.date, row.getAttribute("data-id"))) toast(tr("Moved. The day re-shaped itself."));
  });
})();
$("ticker").addEventListener("dragover", function (e) { e.preventDefault(); });
$("ticker").addEventListener("drop", function (e) {
  var raw = e.dataTransfer.getData("text/plain");
  if (!raw) return;
  var info; try { info = JSON.parse(raw); } catch (err) { return; }
  var cell = e.target.closest ? e.target.closest("[data-date]") : null;
  if (!cell || !info.id) return;
  var t = baseTask(info.id); if (!t) return;
  e.preventDefault();
  moveInstance(t, info.date, cell.getAttribute("data-date"));
  save(); refreshAll(); toast(tr("Moved. The day re-shaped itself."));
});

/* ---------- settings ---------- */
function bindSettings() {
  var s = state.settings;
  $("checkinTime").value = s.checkinTime;
  $("wakeTime").value = s.wakeTime || "07:00"; $("windTime").value = s.windTime || "22:00";
  $("nameLow").value = s.names.low; $("nameSteady").value = s.names.steady; $("nameFull").value = s.names.full;
  $("nCheckin").checked = s.notif.checkin; $("nStart").checked = s.notif.start;
  $("nSetup").value = s.notif.setup; $("nDigest").checked = s.notif.digest;
  $("nDigestTimes").value = s.notif.digestTimes.join(", ");
  $("nDone").checked = s.notif.done; $("nDoneTime").value = s.notif.doneTime;
  renderLeadChips();
  renderNotifStatus();
}
function readSettings() {
  var s = state.settings;
  s.checkinTime = $("checkinTime").value || "08:00";
  s.wakeTime = $("wakeTime").value || "07:00"; s.windTime = $("windTime").value || "22:00";
  try { if (calendar) calendar.setOption("businessHours", dayHours()); } catch (e) {}
  // The energy levels in your own words is a Plus row: a
  // refused rename keeps the names already in place (the
  // check-in itself, with the factory words, stays free).
  var wantNames = { low: $("nameLow").value.trim() || "Low", steady: $("nameSteady").value.trim() || "Steady", full: $("nameFull").value.trim() || "Full" };
  if ((wantNames.low !== s.names.low || wantNames.steady !== s.names.steady || wantNames.full !== s.names.full) && !plusGate("names")) {
    $("nameLow").value = s.names.low; $("nameSteady").value = s.names.steady; $("nameFull").value = s.names.full;
  } else {
    s.names.low = wantNames.low; s.names.steady = wantNames.steady; s.names.full = wantNames.full;
  }
  s.notif.checkin = $("nCheckin").checked; s.notif.start = $("nStart").checked;
  s.notif.setup = Math.max(0, Math.min(60, +$("nSetup").value || 5));
  s.notif.digest = $("nDigest").checked;
  s.notif.digestTimes = $("nDigestTimes").value.split(",").map(validClock).filter(Boolean);
  if (!s.notif.digestTimes.length) s.notif.digestTimes = ["12:30"];
  s.notif.done = $("nDone").checked; s.notif.doneTime = $("nDoneTime").value || "20:00";
  /* Show what was actually kept, so a fixed time is never a silent change. */
  $("nDigestTimes").value = s.notif.digestTimes.join(", ");
  save(); renderCheckin();
}
["checkinTime", "wakeTime", "windTime", "nameLow", "nameSteady", "nameFull", "nCheckin", "nStart", "nSetup", "nDigest", "nDigestTimes", "nDone", "nDoneTime"].forEach(function (id) {
  $(id).addEventListener("change", readSettings);
});
$("clearSamples").addEventListener("click", function () {
  var samples = []; state.tasks.forEach(function (t, i) { if (t.source === "sample") samples.push([t, i]); });
  state.tasks = state.tasks.filter(function (t) { return t.source !== "sample"; });
  save(); refreshAll();
  toast(tr("Sample tasks removed. This is fully yours now."), samples.length ? function () { samples.forEach(function (p) { restoreAt(state.tasks, p[0], p[1]); }); save(); refreshAll(); toast(tr("Back again.")); } : undefined);
});

/* ---------- native notifications bridge ----------
   Inside the store wrap, the same gentle moments are scheduled ON
   the device with Capacitor LocalNotifications (the shape of record,
   Fit's Tranche A-4): the OS fires them even when the app is closed —
   no server, nothing leaves the phone. On the web there is no
   plugin: the plan is a no-op and the browser machinery below
   carries the moments while the app is open, exactly as before.
   Every save replans (cancel the old set, schedule the new), so a
   check-in, a pause, or a settings change rewrites the plan at once.
   A failure here must never break a save: every call is fenced. */
var PaceRemind = (function () {
  var timer = null;
  function plugin() {
    try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) || null; }
    catch (e) { return null; }
  }
  function nid(kind, ref, key) {
    var s = kind + "|" + ref + "|" + key, h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return 1000 + (h % 2000000000);
  }
  function atMs(dayKey, hhmm) { var p = dayKey.split("-"), t = String(hhmm).split(":"); return new Date(+p[0], +p[1] - 1, +p[2], +t[0], +t[1], 0, 0).getTime(); }
  function planDay(dayKey, floor) {
    var s = state.settings, n = s.notif, out = [];
    if (s.pausedDate === dayKey) return out;
    var ad = adaptedFor(dayKey);
    function push(kind, ref, hhmm, title, body, taskId) {
      var at = atMs(dayKey, hhmm);
      // The tap payload rides every reminder (HQ ruling: a tap
      // routes to the task) — the task id for start nudges, the
      // day alone for the day-shaped moments.
      if (at > floor) out.push({ id: nid(kind, ref, dayKey), title: title, body: body, at: at, extra: { paceKind: kind, paceTask: taskId || "", paceDate: dayKey } });
    }
    if (n.checkin && (dayKey !== L.todayKey() || !state.feelings[dayKey]))
      push("checkin", "day", s.checkinTime, tr("How are you feeling today?"), tr("One tap sets the shape of your day."));
    if (n.start) ad.visible.forEach(function (t) {
      if (!t.time) return;
      leadsFor(t).forEach(function (lead) {
        var at = atMs(dayKey, t.time) - lead * 60000;
        if (at <= floor) return;
        var shown = t.displayTitle || t.title;
        var head = lead === 0 ? tr("Starting now: {title}", { title: shown }) : lead >= 60 ? tr("Coming up: {title}", { title: shown }) : tr("Time to start: {title}", { title: shown });
        var body = lead >= 60 ? tr("Starts at {time}. First step: {step}", { time: t.time, step: L.nextStepText(t) }) : tr("First step: {step} · about {n} min.", { step: L.nextStepText(t), n: t.durationMin });
        out.push({ id: nid("start", String(t.id) + "@" + lead, dayKey), title: head, body: body, at: at, extra: { paceKind: "start", paceTask: String(t.id), paceDate: dayKey } });
      });
    });
    if (n.digest) n.digestTimes.forEach(function (hhmm) {
      push("digest", hhmm, hhmm, tr("Your day, gently"), L.digestText(ad.visible));
    });
    if (n.done && dayKey === L.todayKey() && ad.done.length)
      push("done", "day", n.doneTime, tr("Today, done"), tr(ad.done.length === 1 ? "{n} thing done today. The rest is parked for tomorrow." : "{n} things done today. The rest is parked for tomorrow.", { n: ad.done.length }));
    return out;
  }
  function run() {
    var P = plugin(); if (!P) return;
    try {
      var old = [];
      try { old = JSON.parse(localStorage.getItem("pace-remind-ids") || "[]"); } catch (e) {}
      if (old.length) P.cancel({ notifications: old.map(function (id) { return { id: id }; }) }).catch(function () {});
      var notes = [];
      if (state.settings.notif.perm === "granted") {
        var floor = Date.now() + 30000, tk = L.todayKey(), tm = new Date(); tm.setDate(tm.getDate() + 1);
        var mk = tm.getFullYear() + "-" + L.pad(tm.getMonth() + 1) + "-" + L.pad(tm.getDate());
        notes = planDay(tk, floor).concat(planDay(mk, floor));
      }
      try { localStorage.setItem("pace-remind-ids", JSON.stringify(notes.map(function (x) { return x.id; }))); } catch (e) {}
      if (notes.length) P.schedule({ notifications: notes.map(function (x) { return { id: x.id, title: x.title, body: x.body, schedule: { at: new Date(x.at) }, extra: x.extra }; }) }).catch(function () {});
    } catch (e) {}
  }
  function sync() { if (!plugin()) return; if (timer) clearTimeout(timer); timer = setTimeout(run, 400); }
  return { sync: sync, plugin: plugin, nid: nid, available: function () { return !!plugin(); } };
})();

/* ---------- notifications ---------- */
function renderNotifStatus() {
  var n = state.settings.notif;
  if (PaceRemind.available()) {
    $("notifStatus").textContent =
      n.perm === "granted" ? tr("Notifications are on. You choose what they say and when.") :
      n.perm === "denied" ? tr("Notifications are blocked. You can allow them in your phone's settings for Pace.") :
      tr("Notifications are off.");
    /* PACE-007: the static hint line is web truth only — in the phone
       app the reminders are scheduled on the device and ring while
       the app is closed. */
    $("notifHint").textContent = tr("Reminders are set on this phone, so they can ring even when the app is closed.");
    return;
  }
  $("notifHint").textContent = tr("Reminders fire while the app is open.");
  $("notifStatus").textContent = !("Notification" in window) ? tr("This browser does not offer notifications.") :
    n.perm === "granted" ? tr("Notifications are on. You choose what they say and when.") :
    n.perm === "denied" ? tr("Notifications are blocked in the browser. You can allow them in the browser site settings.") :
    tr("Notifications are off.");
}
function notify(title, body, key, tap) {
  if (state.sent[key]) return;
  state.sent[key] = 1; save();
  var data = tap || {};
  function fire() {
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.ready) {
        navigator.serviceWorker.ready.then(function (reg) { if (reg.showNotification) reg.showNotification(title, { body: body, icon: "icon.svg", data: data }); else attachTap(new Notification(title, { body: body, icon: "icon.svg" }), data); }).catch(function () { attachTap(new Notification(title, { body: body }), data); });
      } else attachTap(new Notification(title, { body: body }), data);
    } catch (e) {}
  }
  fire();
}
function attachTap(n, data) { try { n.onclick = function () { try { window.focus(); } catch (e) {} routeNotifTap(data); }; } catch (e) {} return n; }

/* ---------- notification tap -> the task (HQ ruling) ----------
   A reminder exists so the user can act on that task; a tap that
   only opens the app to its home state is a dead end for the exact
   moment the reminder was for. routeNotifTap lands on the task's
   day with the task open; the floor is the right DAY, never a
   bare home open. Payload: { task, date } — task empty for the
   day-shaped moments (check-in, digest, done, test). */
var pendingNotifTap = null;
function routeNotifTap(p) {
  p = p || {};
  var t = p.task ? baseTask(String(p.task)) : null;
  var dayKey = (t && t.date) || p.date || L.todayKey();
  try {
    var dayBtn = document.querySelector('.segmented button[data-view="timeGridDay"]');
    if (dayBtn) dayBtn.click();
    selectDate(dayKey, true);
    if (t) openTask(t.id, dayKey);
  } catch (e) {}
}
function queueNotifTap(p) {
  pendingNotifTap = p || {};
  setTimeout(function () { if (pendingNotifTap) { var q = pendingNotifTap; pendingNotifTap = null; routeNotifTap(q); } }, 350);
}
function requestNotif() {
  var P = PaceRemind.plugin();
  if (P) {
    P.requestPermissions().then(function (res) {
      state.settings.notif.perm = res && res.display === "granted" ? "granted" : "denied";
      save(); renderNotifStatus();
      toast(state.settings.notif.perm === "granted" ? tr("Notifications on. Gentle ones, chosen by you.") : tr("No problem. The app still works fully without them."));
    }).catch(function () { toast(tr("No problem. The app still works fully without them.")); });
    return;
  }
  if (!("Notification" in window)) { toast(tr("This browser does not offer notifications.")); return; }
  Notification.requestPermission().then(function (p) {
    state.settings.notif.perm = p; save(); renderNotifStatus();
    if (p === "granted") toast(tr("Notifications on. Gentle ones, chosen by you."));
    else toast(tr("No problem. The app still works fully without them."));
  });
}
$("notifEnable").addEventListener("click", requestNotif);
$("notifTest").addEventListener("click", function () {
  var P = PaceRemind.plugin();
  if (P) {
    if (state.settings.notif.perm !== "granted") { toast(tr("Turn notifications on first, then the test can arrive.")); return; }
    try { P.schedule({ notifications: [{ id: PaceRemind.nid("test", "pace", "test"), title: "Pace", body: tr("This is your test. Gentle, like the real ones."), schedule: { at: new Date(Date.now() + 3000) }, extra: { paceKind: "test", paceTask: "", paceDate: L.todayKey() } }] }).catch(function () {}); } catch (e) {}
    return;
  }
  if (!("Notification" in window)) { toast(tr("This browser does not offer notifications.")); return; }
  if (Notification.permission !== "granted") { toast(tr("Turn notifications on first, then the test can arrive.")); return; }
  try { new Notification("Pace", { body: tr("This is your test. Gentle, like the real ones.") }); } catch (e) {}
});
$("notifPause").addEventListener("click", function () {
  state.settings.pausedDate = L.todayKey(); save(); toast(tr("Paused for today. Silence is a fine choice."));
});
function checkNotifications() {
  if (PaceRemind.available()) return; /* native: the device plan carries the moments */
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  var s = state.settings, today = L.todayKey();
  if (s.pausedDate === today) return;
  var now = new Date(), hhmm = L.pad(now.getHours()) + ":" + L.pad(now.getMinutes());
  var n = s.notif;
  if (n.checkin && hhmm === s.checkinTime && !state.feelings[today]) {
    notify(tr("How are you feeling today?"), tr("One tap sets the shape of your day."), "checkin-" + today, { task: "", date: today });
  }
  var ad = adaptedFor(today);
  if (n.start) {
    var nowMin = Math.floor(Date.now() / 60000);
    [today, L.addDays(today, 1)].forEach(function (day) {
      adaptedFor(day).visible.forEach(function (t) {
        if (!t.time) return;
        var p = day.split("-"), tt = t.time.split(":");
        var base = new Date(+p[0], +p[1] - 1, +p[2], +tt[0], +tt[1], 0, 0).getTime();
        leadsFor(t).forEach(function (lead) {
          if (Math.floor((base - lead * 60000) / 60000) !== nowMin) return;
          var shown = t.displayTitle || t.title;
          var head = lead === 0 ? tr("Starting now: {title}", { title: shown }) : lead >= 60 ? tr("Coming up: {title}", { title: shown }) : tr("Time to start: {title}", { title: shown });
          var body = lead >= 60 ? tr("Starts at {time}. First step: {step}", { time: t.time, step: L.nextStepText(t) }) : tr("First step: {step} · about {n} min.", { step: L.nextStepText(t), n: t.durationMin });
          notify(head, body, "start-" + t.id + "-" + day + "-" + lead, { task: String(t.id), date: day });
        });
      });
    });
  }
  if (n.digest && n.digestTimes.indexOf(hhmm) !== -1) {
    notify(tr("Your day, gently"), L.digestText(ad.visible), "digest-" + today + "-" + hhmm, { task: "", date: today });
  }
  if (n.done && hhmm === n.doneTime && ad.done.length) {
    notify(tr("Today, done"), tr(ad.done.length === 1 ? "{n} thing done today. The rest is parked for tomorrow." : "{n} things done today. The rest is parked for tomorrow.", { n: ad.done.length }), "done-" + today, { task: "", date: today });
  }
}
setInterval(checkNotifications, 30000);
/* Tap entries: the service worker's notificationclick posts the
   payload (or opens the app with it in the address); a packaged
   cold start can also carry it the same way. */
try {
  var nqs = new URLSearchParams(location.search);
  if (nqs.get("paceTask") || nqs.get("paceDay")) queueNotifTap({ task: nqs.get("paceTask") || "", date: nqs.get("paceDay") || "" });
} catch (e) {}
if (navigator.serviceWorker) { try { navigator.serviceWorker.addEventListener("message", function (ev) { if (ev.data && ev.data.paceTap) queueNotifTap(ev.data.paceTap); }); } catch (e) {} }
/* Native boot: mirror the device's real permission, then plan. */
if (PaceRemind.available()) {
  try {
    PaceRemind.plugin().addListener("localNotificationActionPerformed", function (ev) {
      var x = ev && ev.notification && ev.notification.extra;
      queueNotifTap(x ? { task: x.paceTask || "", date: x.paceDate || "" } : null);
    });
  } catch (e) {}
  PaceRemind.plugin().checkPermissions().then(function (res) {
    if (res) state.settings.notif.perm = res.display === "granted" ? "granted" : (res.display === "denied" ? "denied" : state.settings.notif.perm);
    renderNotifStatus(); PaceRemind.sync();
  }).catch(function () { PaceRemind.sync(); });
}

/* ---------- welcome ---------- */
if (!state.welcomed && ACTIVE_UID) {
  // Address the user by their own name when the profile
  // carries one (asked at sign-up; theirs alone).
  var wn = (state.settings.profileName || "").trim().split(/\s+/)[0];
  if (wn) $("welcomeTitle").textContent = tr("Welcome to Pace Calendar, {name}", { name: wn });
  $("welcome").hidden = false;
}
$("welcomeSkip").addEventListener("click", function () { state.welcomed = true; save(); $("welcome").hidden = true; maybeGuide(); });
$("welcomeNotif").addEventListener("click", function () { state.welcomed = true; save(); $("welcome").hidden = true; maybeGuide(); });

/* ---------- Skip the Ferry: the setup guide (Lab spec GUIDE-MASCOTS-001) ----------
   One SVG master with changing poses. The visual guide has three content
   steps; name and menu stops stay outside those progress dots. Closing never
   blocks, and the guide reopens from Settings. */
function skipSvg(pose) {
  /* Skip's guide art of record (variant B composition, finished as vector
     14 Oct 2026): full ferry, the calendar smaller inside him as his
     cabin, board palette. Poses are prop/transform changes on one master. */
  var ink = "#21392E", hull = "#5B6BD5", cream = "#FAF4E4", flagGreen = "#2F7D4F", dotGreen = "#35704E", apricot = "#F0A868", wave = "#AEB8EC";
  var flagRot = pose === "point" ? "14" : pose === "goodbye" ? "-12" : "0";
  var flag = '<g transform="rotate(' + flagRot + ' 120 30)"><line x1="120" y1="8" x2="120" y2="48" stroke="' + ink + '" stroke-width="6.5" stroke-linecap="round"/><path d="M120 10 L149 19.5 L120 29 Z" fill="' + flagGreen + '"/></g>';
  var spray = pose === "celebrate" ? '<path d="M27 103 q-9 -9 -17 -7 M29 115 q-10 -3 -15 3" fill="none" stroke="' + apricot + '" stroke-width="5" stroke-linecap="round"/>' : "";
  var trail = pose === "goodbye" ? '<path d="M2 172 q8 -8 16 0 q8 8 16 0" fill="none" stroke="' + wave + '" stroke-width="5" stroke-linecap="round" opacity="0.55"/>' : "";
  var tilt = pose === "celebrate" ? ' transform="rotate(2 120 110)"' : pose === "point" ? ' transform="rotate(-2 120 110)"' : "";
  return '<svg viewBox="0 0 240 196" class="skip-svg" aria-hidden="true"><g' + tilt + '>' + spray +
    '<path d="M22 118 H218 L186 164 H54 Z" fill="' + hull + '" stroke="' + ink + '" stroke-width="7" stroke-linejoin="round"/>' +
    '<rect x="80" y="46" width="80" height="78" rx="13" fill="' + cream + '" stroke="' + ink + '" stroke-width="7"/>' +
    '<circle cx="98" cy="40" r="8" fill="none" stroke="' + ink + '" stroke-width="6"/>' +
    '<circle cx="142" cy="40" r="8" fill="none" stroke="' + ink + '" stroke-width="6"/>' +
    '<circle cx="102" cy="64" r="4.5" fill="' + dotGreen + '"/><circle cx="120" cy="64" r="4.5" fill="' + dotGreen + '"/><circle cx="138" cy="64" r="4.5" fill="' + apricot + '"/>' +
    '<circle cx="108" cy="88" r="6.8" fill="' + ink + '"/><circle cx="132" cy="88" r="6.8" fill="' + ink + '"/>' +
    '<circle cx="105.8" cy="85.8" r="2.1" fill="#fff"/><circle cx="129.8" cy="85.8" r="2.1" fill="#fff"/>' +
    '<circle cx="93" cy="98" r="4.6" fill="' + apricot + '" opacity="0.55"/><circle cx="147" cy="98" r="4.6" fill="' + apricot + '" opacity="0.55"/>' +
    '<path d="M108 99 q12 10 24 0" fill="none" stroke="' + ink + '" stroke-width="5" stroke-linecap="round"/>' + flag + '</g>' + trail +
    '<path d="M16 182 q16 -12 32 0 t32 0 t32 0 t32 0 t32 0 t32 0" fill="none" stroke="' + wave + '" stroke-width="8" stroke-linecap="round"/></svg>';
}
var GUIDE_STEPS = [
  { kind: "step", pose: "welcome", bubble: "Your calendar starts empty. Add only what you choose.", next: "Next" },
  { kind: "step", pose: "point", bubble: "How are you feeling today?", next: "Next", action: "energy" },
  { kind: "step", pose: "point", bubble: "Pick a look you like.", next: "Next", themes: true },
  { kind: "step", pose: "celebrate", bubble: "Add your first task when you're ready.", next: "Next", action: "task" }
];
/* Skip's guide is short enough to skip, but covers the real setup
   choices first, then offers calendar import and reminders, and finally
   tours every bottom tab and the More menu. */
function tourNeedsName() { return !((state.settings.profileName || "").trim()); }
var TOUR = [];
function buildTour() {
  TOUR = [];
  if (tourNeedsName()) TOUR.push({ kind: "name", pose: "welcome", bubble: "Ahoy! I'm Skip. Welcome aboard! What's your name?", next: "Next" });
  GUIDE_STEPS.forEach(function (step) { TOUR.push(Object.assign({}, step)); });
  TOUR.push({ kind: "import", pose: "point", bubble: "Bring in an old calendar if you want. The file is copied; it is never changed.", next: "Next" });
  TOUR.push({ kind: "reminders", pose: "point", bubble: "Reminders are optional. Choose if you want a gentle prompt.", next: "Next", panel: "settings" });
  TOUR.push({ kind: "tour", panel: "today", pose: "welcome", bubble: "Today is for the day in front of you.", next: "Next" });
  TOUR.push({ kind: "tour", panel: "calendar", pose: "point", bubble: "Calendar lets you switch Day, Week, Month, Year, and Agenda.", next: "Next" });
  TOUR.push({ kind: "tour", panel: "capture", pose: "point", bubble: "Talk to it turns a sentence into tasks. Speaking is optional.", next: "Next" });
  TOUR.push({ kind: "tour", panel: "todo", pose: "point", bubble: "To do keeps loose tasks beside the calendar.", next: "Next" });
  TOUR.push({ kind: "tour", panel: "more", pose: "point", bubble: "More opens Progress, Habits, Goals, and Settings.", next: "Next" });
  TOUR.push({ kind: "tour", panel: "progress", pose: "point", bubble: "Progress groups tasks by status. If it is locked, Pace will say so.", next: "Next" });
  TOUR.push({ kind: "tour", panel: "habits", pose: "point", bubble: "Habits helps you notice routines, one day at a time.", next: "Next" });
  TOUR.push({ kind: "tour", panel: "goals", pose: "point", bubble: "Goals turns one big goal into one small step a day on your calendar.", next: "Next" });
  TOUR.push({ kind: "tour", panel: "settings", section: "profileCard", pose: "welcome", bubble: "This is Settings. Your name and email are at the top.", next: "Next" });
  TOUR.push({ kind: "tour", panel: "settings", section: "accountGroup", pose: "point", bubble: "Account: your name, sign out, and download your data.", next: "Next" });
  TOUR.push({ kind: "tour", panel: "settings", section: "setLook", pose: "point", bubble: "Look: pick a colour, a photo, or Cute mode.", next: "Next" });
  TOUR.push({ kind: "tour", panel: "settings", section: "setCheckin", pose: "point", bubble: "Check-in: when I ask how you feel, and what you call Bad, Ok and Great.", next: "Next" });
  TOUR.push({ kind: "tour", panel: "settings", section: "setNotif", pose: "point", bubble: "Reminders: choose how early each reminder comes. Each task can have its own.", next: "Next" });
  TOUR.push({ kind: "tour", panel: "settings", section: "setTasks", pose: "point", bubble: "Tasks: bring a calendar in, or save yours as a file.", next: "Next" });
  TOUR.push({ kind: "tour", panel: "settings", section: "setHelp", pose: "celebrate", bubble: "Help is here if you get stuck. Everything in Pace is free.", next: "Done ✓", last: true });
}
var guideStep = 0;
var guideResumeAfterTask = null;
function showGuide(step) {
  if (!TOUR.length) buildTour();
  guideStep = step;
  var s = TOUR[step];
  if (!s) return;
  if (s.kind === "tour") {
    if (s.panel === "today") {
      var dayBtn = document.querySelector('.segmented button[data-view="timeGridDay"]');
      if (dayBtn && currentView !== "timeGridDay") dayBtn.click();
      showPanel("calendar"); selectDate(L.todayKey(), true); setBottomTab("today");
    } else if (s.panel === "calendar") { showPanel("calendar"); setBottomTab("calendar"); }
    else if (s.panel === "capture") { showPanel("capture"); setBottomTab("capture"); }
    else if (s.panel === "todo") { showPanel("todo"); setBottomTab("todo"); }
    else if (s.panel === "habits") { showPanel("habits"); setBottomTab("more"); }
    else if (s.panel === "goals") { showPanel("goals"); setBottomTab("more"); }
    else if (s.panel === "settings") { showPanel("settings"); setBottomTab("more"); }
    else if (s.panel === "more" || s.panel === "progress") { setBottomTab("more"); }
  } else if (s.kind === "reminders") { showPanel("settings"); setBottomTab("more"); }
  $("guideArt").innerHTML = skipSvg(s.pose);
  $("guideBubble").textContent = tr(s.bubble);
  $("guideNext").textContent = tr(s.next);
  $("guideImport").hidden = s.kind !== "import" || DEMO_SESSION;
  var contentStep = s.kind === "step" ? TOUR.slice(0, step + 1).filter(function (x) { return x.kind === "step"; }).length - 1 : -1;
  $("guideDots").innerHTML = s.kind === "step" ? GUIDE_STEPS.map(function (_, i) { return '<span class="g-dot' + (i === contentStep ? " is-on" : "") + '"></span>'; }).join("") : "";
  var sheet = $("guideSheet");
  var menuStop = s.kind === "tour" && (s.panel === "more" || s.panel === "progress");
  if (menuStop) {
    document.documentElement.removeAttribute("data-sb");
    sheet.setAttribute("data-dock", "menu");
  } else {
    sheet.removeAttribute("data-dock");
    applySidebar();
  }
  document.querySelectorAll(".guide-target").forEach(function (el) { el.classList.remove("guide-target"); });
  var target = null;
  if (s.kind === "tour") {
    if (s.panel === "more") target = $("sbExpand");
    else if (s.panel === "progress") target = document.querySelector('.side-item[data-panel="progress"]');
    else target = document.querySelector('#bottomTabs [data-tab="' + (s.panel === "capture" ? "capture" : s.panel === "todo" ? "todo" : s.panel === "settings" || s.panel === "habits" || s.panel === "goals" ? "more" : s.panel) + '"]');
  }
  if (s.section && $(s.section)) { target = $(s.section); try { target.scrollIntoView({ block: "start", behavior: "auto" }); } catch (e) {} }
  if (target) target.classList.add("guide-target");
  var ex = $("guideExtra");
  if (s.kind === "name") {
    ex.innerHTML = '<input type="text" id="tourName" class="tour-name-input" autocomplete="name" placeholder="' + tr("Your name") + '" aria-label="' + tr("Your name") + '">';
  } else if (s.action === "energy") {
    var currentFeeling = state.feelings[L.todayKey()] || "";
    ex.innerHTML = '<div class="guide-energy">' + [["low", state.settings.names.low], ["steady", state.settings.names.steady], ["full", state.settings.names.full]].map(function (pair) {
      return '<button type="button" class="soft-btn guide-energy-btn" data-energy="' + pair[0] + '" aria-pressed="' + String(currentFeeling === pair[0]) + '">' + esc(pair[1]) + '</button>';
    }).join("") + '</div>';
    ex.querySelectorAll("[data-energy]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.feelings[L.todayKey()] = button.getAttribute("data-energy");
        save(); refreshAll();
        ex.querySelectorAll("[data-energy]").forEach(function (choice) { choice.setAttribute("aria-pressed", String(choice === button)); });
      });
    });
  } else if (s.action === "task") {
    var hasOwnTask = (state.tasks || []).some(function (task) { return task && task.source !== "sample"; });
    ex.innerHTML = hasOwnTask ? '' : '<button type="button" id="guideTaskOpen" class="primary-btn guide-action">' + tr("Add a task now") + '</button>';
    if (!hasOwnTask) $("guideTaskOpen").addEventListener("click", function () {
      if (guideResumeAfterTask !== null) return;
      guideResumeAfterTask = guideStep + 1;
      $("guideSheet").hidden = true;
      $("addBtn").click();
    });
  } else if (s.themes) {
    var GUIDE_THEMES = ["white", "dark"];
    ex.innerHTML = '<div class="guide-swatches">' + GUIDE_THEMES.map(function (t) {
      return '<button class="g-swatch" data-g-theme="' + t + '" style="background:' + THEME_COLORS[t] + '" aria-label="' + tr(t === "white" ? "White theme" : "Dark theme") + '"></button>';
    }).join("") + "</div>";
    ex.querySelectorAll("[data-g-theme]").forEach(function (b) {
      b.addEventListener("click", function () { var t = b.getAttribute("data-g-theme"); state.settings.appearance.theme = t; state.settings.appearance.bgChoice = "theme"; save(); applyAppearance(); });
    });
  } else if (s.kind === "reminders") {
    var reminderButton = document.createElement("button"); reminderButton.type = "button"; reminderButton.className = "soft-btn guide-action";
    reminderButton.textContent = tr(state.settings.notif.perm === "granted" ? "Notifications are on. You choose what they say and when." : "Turn on notifications");
    reminderButton.disabled = state.settings.notif.perm === "granted";
    reminderButton.addEventListener("click", function () { $("notifEnable").click(); });
    ex.appendChild(reminderButton);
  } else ex.innerHTML = "";
  $("guideSheet").hidden = false;
}
/* The name re-ask bookkeeping (HQ ruling): a name step left
   unanswered earns ONE gentle re-offer on the NEXT visit —
   never the same session, never a third time. "Visit" is a
   page load: BOOT_T stamps this load, and a skip recorded
   under an earlier stamp is what unlocks the re-offer. */
var BOOT_T = Date.now();
function noteNameSkip() {
  // The skip also stamps THIS SITTING (sessionStorage survives
  // reloads, dies with the app/tab): the re-offer's own rule is
  // "never the same session", and a page reload is the same
  // sitting — build 13's Leg 6 flake was the re-offer firing on
  // the second boot of one sitting, caught or missed by the
  // checker purely on reconcile timing.
  try { sessionStorage.setItem("pace-name-skip-sitting", ACTIVE_UID || ""); } catch (e) {}
  if (!tourNeedsName()) return;
  if (!TOUR.some(function (s) { return s.kind === "name"; })) return;
  try { localStorage.setItem("pace-name-skip", (ACTIVE_UID || "") + ":" + BOOT_T); } catch (e) {}
}
function closeGuide() {
  noteNameSkip();
  $("guideSheet").hidden = true;
  $("guideSheet").removeAttribute("data-dock");
  applySidebar();
  TOUR = [];
  if (!state.settings.guideDone) { state.settings.guideDone = true; save(); toast(tr("See you at the dock.")); }
}
function maybeGuide() { if (!state.settings.guideDone) { buildTour(); showGuide(0); } }
$("guideClose").addEventListener("click", closeGuide);
$("guideSkip").addEventListener("click", closeGuide);
$("guideNext").addEventListener("click", function () {
  var s = TOUR[guideStep];
  if (!s) return;
  if (s.kind === "name") {
    // The tour's first stop IS the name ask: Next carries
    // whatever is typed onto the profile (empty = skipped
    // in the moment; Settings keeps the name row forever).
    var inp = $("tourName");
    var nm = inp ? inp.value.trim().slice(0, 60) : "";
    if (nm) {
      state.settings.profileName = nm; save(); renderAccount();
      toast(tr("Hi {name} — you're in.", { name: nm.split(/\s+/)[0] }));
    }
  }
  if (s.last || guideStep >= TOUR.length - 1) closeGuide();
  else showGuide(guideStep + 1);
});
$("guideAgain").addEventListener("click", function () { TOUR = []; buildTour(); showGuide(0); });
if ($("settingsTour")) $("settingsTour").addEventListener("click", function () {
  if (!TOUR.length) buildTour();
  var i = -1;
  TOUR.forEach(function (x, k) { if (i < 0 && x.section) i = k; });
  if (i >= 0) { $("guideSheet").hidden = false; showGuide(i); }
});

/* ---------- the upgrade moment ---------- */
/* THE LOCKED TAP (the paid/free rules, 19 Oct: paid features release
   only on an active entitlement; a locked tap SPEAKS and opens
   the plans path — never silent, never a partial unlock).
   plusGate(edge) is the single door every Plus feature's apply
   point passes: entitled (a live subscriptions record or the
   free month — PaceBilling.plusActive) applies silently; not
   entitled speaks through maybePlus and the feature does NOT
   apply. This supersedes the PACE-002 timing of the
   nothing-locked era (first entry clean, speak on a repeat
   visit): that ruling governed a popup over features that
   still worked; with real locks the first locked tap speaks
   too. (Pace has no repeat picker — repeats arrive through
   Talk to it, already an edge, and through import, a completed
   flow with no wanting-moment.) */
var plusShown = {};
function maybePlus(edge) {
  return; /* all features free for now: no upgrade sheet */
  if (DEMO_SESSION) return;
  plusShown[edge] = 1;
  $("plusArt").innerHTML = skipSvg("welcome");
  $("plusSheet").hidden = false;
  renderPlans();
}
function plusGate(edge) {
  if (window.PaceBilling && PaceBilling.plusActive()) return true;
  maybePlus(edge);
  return false;
}
function closePlus() { $("plusSheet").hidden = true; }
$("plusClose").addEventListener("click", closePlus);
$("plusNotNow").addEventListener("click", closePlus);
$("plusPlans").addEventListener("click", function () { closePlus(); renderPlans(); $("plansSheet").hidden = false; });
$("plansOpen").addEventListener("click", function () { renderPlans(); $("plansSheet").hidden = false; });
$("plansClose").addEventListener("click", function () { $("plansSheet").hidden = true; });

/* ---------- plans + buying (the enabling build) ----------
   The buy buttons are Pace's own (the sheet's classes, the
   app's voice) and they live only where a store lives: the
   packaged app, once billing is configured. Everywhere else
   the sheet keeps the honest not-on-sale line. Prices on the
   buttons are the store's own strings for the reader's
   storefront, with the A$ anchors as the fallback. */
function billingOnDevice() {
  try { return !!(window.PaceBilling && PaceBilling.live() && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases); } catch (e) { return false; }
}
function renderPlans() {
  var on = billingOnDevice();
  $("planBuy").hidden = !on;
  $("planTerms").hidden = !on;
  if (on) {
    // The disclosure's prices come from the same source as
    // the buttons' prices, so the two can never drift.
    PaceBilling.storePrices().then(function (sp) {
      var t = $("planTermsText"); if (!t) return;
      t.textContent = tr("Plus, monthly ({m}) and Plus, yearly ({y}) renew automatically at those prices, until you cancel. Cancel anytime in your Apple ID subscriptions. Plus stays open until the end of the paid period. Plus for life ({l}) is one payment. It never renews.", {
        m: sp[PaceBilling.products.monthly] || PaceBilling.productPrice("monthly"),
        y: sp[PaceBilling.products.yearly] || PaceBilling.productPrice("yearly"),
        l: sp[PaceBilling.products.lifetime] || PaceBilling.productPrice("lifetime")
      });
    }).catch(function () {});
  }
  var honest = $("plusHonest");
  if (honest) honest.textContent = on ? tr("Unlock with a paid plan.") : tr("Unlock with a paid plan when plans open at launch. Nothing can be charged today.");
  var st = $("planState"); if (!st) return;
  var holds = $("planHolds");
  if (holds) holds.textContent = on
    ? tr("Plus holds: all six Looks and Cute mode · Talk to it · repeating tasks · breaking a task into small steps · a stretch task borrowed from tomorrow · the energy levels in your own words · the To Do board · the kind round-up.")
    : tr("When Plus arrives, it holds: all six Looks and Cute mode · Talk to it · repeating tasks · breaking a task into small steps · a stretch task borrowed from tomorrow · the energy levels in your own words · the To Do board · the kind round-up.");
  if (!on) { st.textContent = tr("Not on sale yet. Nothing to pay today."); return; }
  var s = PaceBilling.state();
  if (PaceBilling.plusActive() && s.owned) st.textContent = tr("Plus is yours. Everything is open.");
  else if (PaceBilling.plusActive()) st.textContent = tr("Your first month is free, on us. The buttons are here when you are ready.");
  else st.textContent = tr("Pick a plan to unlock everything.");
  PaceBilling.storePrices().then(function (p) {
    if (!p) return;
    var pm = p[PaceBilling.products.monthly], py = p[PaceBilling.products.yearly], pl = p[PaceBilling.products.lifetime];
    $("buyMonthly").textContent = tr("Plus, monthly") + " — " + (pm || "A$4.99");
    $("buyYearly").textContent = tr("Plus, yearly") + " — " + (py || "A$39.99");
    $("buyLifetime").textContent = tr("Plus for life") + " — " + (pl || "A$99.99");
    // POLAR P2: the copy lines speak the SAME store prices as
    // the buttons (never the A$ anchors beside live store
    // numbers). Only overwrite when the store answered for
    // that product; the static anchors stand otherwise.
    if (pm && py) {
      var pp = $("planPriceLine"); if (pp) pp.textContent = tr("{m} a month, or {y} a year. First month free.", { m: pm, y: py });
      var xp = $("plusPriceLine"); if (xp) xp.textContent = tr("Plus is {m} a month, or {y} a year. Your first month is free.", { m: pm, y: py });
    }
    if (pl) { var lp = $("planLifeLine"); if (lp) lp.textContent = tr("Or Plus for life: {l}, once.", { l: pl }); }
  }).catch(function () {});
}
function buyFlow(productId) {
  PaceBilling.buy(productId).then(function () {
    renderPlans();
    toast(PaceBilling.plusActive() ? tr("Plus is yours. Everything is open.") : tr("That did not go through. Nothing was charged."));
  }).catch(function () { toast(tr("That did not go through. Nothing was charged.")); });
}
$("buyMonthly").addEventListener("click", function () { buyFlow(PaceBilling.products.monthly); });
$("buyYearly").addEventListener("click", function () { buyFlow(PaceBilling.products.yearly); });
$("buyLifetime").addEventListener("click", function () { buyFlow(PaceBilling.products.lifetime); });
$("buyRestore").addEventListener("click", function () {
  PaceBilling.restore().then(function () {
    renderPlans();
    toast(PaceBilling.plusActive() ? tr("Welcome back. Plus is yours again.") : tr("No past purchase found for this account."));
  }).catch(function () { toast(tr("That did not go through. Nothing was charged.")); });
});

/* ---------- bring my calendar in (shared module: IMPORT-DESIGN.md) ---------- */
var DEMO_SESSION = false; // build 33: the demo road is abolished by the door ruling (29 Oct) — no demo, guest or preview way into the app exists; the flag stays only so its old guards read false.
var IMPORT_GUIDE = {
  google: "calendar.google.com \u2192 the gear \u2192 Settings \u2192 Import & export \u2192 Export. Inside the download is a file ending .ics. Bring that file here.",
  apple: "In a browser: iCloud.com \u2192 Calendar \u2192 the share icon by a calendar \u2192 Public Calendar. Open the link it gives you \u2014 a file downloads. Bring that file here.",
  outlook: "Outlook on the web \u2192 the gear \u2192 Calendar \u2192 Shared calendars \u2192 Publish a calendar. Open the ICS link it gives you \u2014 a file downloads. Bring that file here.",
  file: "Pick the .ics file your old calendar exported. It is read once, copied in, and the file itself is never changed."
};
var IMPORT_LABELS = { google: "Google Calendar", apple: "Apple / iCloud", outlook: "Outlook", file: "a calendar file" };
var importSource = "google";
function openImport() { if (DEMO_SESSION) return; $("importResult").textContent = ""; $("importSheet").hidden = false; }
function shapeToTask(s) {
  var cat = L.categoryFor(s.title);
  var words = [s.location, s.notes].filter(Boolean).join(" \u2014 ");
  return { id: uid(), title: s.title, date: s.date, time: s.time, durationMin: s.durationMin, allDay: !!s.allDay, priority: 0, repeat: s.repeat, category: cat.id, color: cat.color, essential: false, status: "todo", steps: [], minVersion: "", fullVersion: "", source: "import", originalText: words, skipDates: [], doneDates: [], importUid: s.importUid, importKey: s.importKey };
}
function runImport(text, label) {
  var parsed = window.CI.parseICS(text);
  if (parsed.error) {
    var failed = [tr("That didn\u2019t read as a calendar. Nothing was brought in.")];
    if (parsed.malformedLines) failed.push(parsed.malformedLines + " " + tr(parsed.malformedLines === 1 ? "malformed line ignored" : "malformed lines ignored"));
    $("importResult").textContent = failed.join(" · ");
    return;
  }
  var plan = window.CI.planImport(parsed, state.tasks, { sourceLabel: label });
  var res = window.CI.applyImport(state, plan, label, shapeToTask);
  save(); refreshAll();
  if (res.added > 0) {
    markActivated("import");
    if (ACTIVE_UID && FB.configured) {
      var totalEv = (state.imports || []).reduce(function (a, r) { return a + (r.count || 0); }, 0);
      FB.fsSet("aggImports/" + ACTIVE_UID, { events: totalEv, imports: (state.imports || []).length, at: new Date().toISOString() }).catch(function () {});
    }
  }
  function countLabel(n, one, many) { return n + " " + tr(n === 1 ? one : many); }
  var bits = [countLabel(res.added, "event brought in", "events brought in")];
  if (res.expanded) bits.push(countLabel(res.expanded, "repeat date expanded", "repeat dates expanded"));
  if (res.liveRepeats) bits.push(countLabel(res.liveRepeats, "repeat kept live", "repeats kept live"));
  if (res.dupes) bits.push(countLabel(res.dupes, "already in Pace", "already in Pace"));
  if (res.skipped) bits.push(countLabel(res.skipped, "event skipped", "events skipped"));
  if (res.outsideWindow) bits.push(countLabel(res.outsideWindow, "outside the import range", "outside the import range"));
  if (res.cancelled) bits.push(countLabel(res.cancelled, "cancelled event ignored", "cancelled events ignored"));
  if (res.malformedLines) bits.push(countLabel(res.malformedLines, "malformed line ignored", "malformed lines ignored"));
  $("importResult").textContent = bits.join(" \u00B7 ") + ".";
  toast(res.added ? tr("Calendar brought in.") : tr("Nothing new to bring in."));
}
if (DEMO_SESSION) { $("importBtn").hidden = true; $("importOpen2").hidden = true; $("exportCalendarBtn").hidden = true; }
$("importBtn").addEventListener("click", openImport);
$("importOpen2").addEventListener("click", openImport);
$("guideImport").addEventListener("click", function () { closeGuide(); openImport(); });
function exportCalendarICS() {
  var text;
  try { text = window.PaceCalendarExport.toICS(state); }
  catch (e) { toast(tr("Calendar export did not work. Nothing was changed.")); return; }
  var FS = null, SH = null;
  try { FS = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem; SH = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share; } catch (e) {}
  if (FS && SH) {
    FS.writeFile({ path: "pace-calendar.ics", data: text, directory: "CACHE", encoding: "utf8" })
      .then(function () { return FS.getUri({ path: "pace-calendar.ics", directory: "CACHE" }); })
      .then(function (r) { return SH.share({ title: "Pace Calendar", text: tr("Calendar file is ready to share."), url: r.uri }); })
      .then(function () { toast(tr("Calendar file is ready to share.")); })
      .catch(function () { toast(tr("Calendar export did not work. Nothing was changed.")); });
    return;
  }
  try {
    var blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
    var a = document.createElement("a"), url = URL.createObjectURL(blob);
    a.href = url; a.download = "pace-calendar.ics"; a.style.display = "none";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    toast(tr("Calendar file downloaded."));
  } catch (e) { toast(tr("Calendar export did not work. Nothing was changed.")); }
}
$("exportCalendarBtn").addEventListener("click", exportCalendarICS);
$("importClose").addEventListener("click", function () { $("importSheet").hidden = true; });
document.querySelectorAll(".import-src").forEach(function (b) {
  b.addEventListener("click", function () {
    importSource = b.getAttribute("data-src");
    document.querySelectorAll(".import-src").forEach(function (x) { x.classList.toggle("is-active", x === b); });
    $("importGuide").textContent = tr(IMPORT_GUIDE[importSource]);
  });
});
/* One import path only: the file. A pasted-link fetch stood here until
   18 Oct — it could never work (calendar hosts send no CORS headers, so
   the platform blocks the read; iCloud links are webcal://, which fetch
   cannot open), exactly as a real phone report showed. The link field,
   its button and the fetch are gone; the file is the path. */
$("importFileBtn").addEventListener("click", function () { $("importFile").click(); });
$("importFile").addEventListener("change", function () {
  var f = $("importFile").files && $("importFile").files[0];
  if (!f) return;
  var rd = new FileReader();
  rd.onload = function () { runImport(String(rd.result || ""), importSource === "file" ? "a calendar file" : IMPORT_LABELS[importSource]); };
  rd.onerror = function () { $("importResult").textContent = tr("That file couldn\u2019t be read."); };
  rd.readAsText(f);
  $("importFile").value = "";
});
/* Signed-in boots defer the tour decision to the reconcile's
   tail — the settled state's guideDone governs, never the
   pre-adopt read. A boot with NO session never reaches the app
   at all (the door ruling, 29 Oct): the door is the only page —
   no guest road, no demo, no preview. lockDoor stands the door
   page up and the stylesheet keeps every piece of app chrome
   undisplayed while data-door="locked" stands. Signing in
   reloads (afterSignIn) into a session boot, which never locks. */
if (!ACTIVE_UID) lockDoor();

/* ---------- accounts (the accounts wave) ----------
   Guest mode is forever: everything below is inert unless the
   Firebase config has landed AND a session exists. The spine is
   the contracts' light record (createdAt / lastActiveAt / plan /
   activatedAt) — the state itself lives at users/{uid}/data/state
   as one JSON string, so count-only readers (the CEO dashboard)
   can never reach a state payload. */
var spine = null;
var syncTimer = null;
var syncBusy = false;
var syncDirty = false;
var reconcilePending = false;
function spinePath() { return "users/" + ACTIVE_UID; }
function statePath() { return "users/" + ACTIVE_UID + "/data/state"; }
function scheduleSync() {
  if (!ACTIVE_UID || !FB.configured) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 1200);
}
var DELETING = false;
/* THE SYNC RACE (QA remainder round, 19 Oct — legs 1/5 lost data
   on some runs, kept it on others): three holes, one disease —
   content could move backwards while its stamps moved forwards.
   (1) A debounced push could land WHILE a sign-in reconcile was
   still fetching, stamping pre-adopt content onto the server.
   (2) A push arriving while another was in flight was DROPPED,
   leaving the server holding older content under a fresher
   write-time stamp; the next adopt then threw the newer local
   data away. (3) Sign-out reloaded without flushing, so the last
   seconds of changes never left the device. The fixes: pushes
   GATE on the reconcile (never dropped — marked dirty and fired
   the moment the gate lifts, carrying post-adopt state); a push
   in flight re-queues instead of dropping; the state doc's
   updatedAt is the CONTENT's own stamp (state.updatedAt, set by
   save()), never the write time; and sign-out flushes first. */
function syncNow() {
  if (!ACTIVE_UID || !FB.configured || DELETING) return Promise.resolve();
  if (reconcilePending || syncBusy) { syncDirty = true; return Promise.resolve(); }
  syncBusy = true; syncDirty = false;
  var payload = JSON.stringify(state);
  var stamp = new Date((state && state.updatedAt) || Date.now()).toISOString();
  var p = FB.fsSet(statePath(), { stateJson: payload, updatedAt: stamp }).then(function () {}, function () {});
  var settle = function () { syncBusy = false; if (syncDirty) { syncDirty = false; syncNow(); } };
  p.then(settle, settle);
  var note = $("accountNote");
  if (note && payload.length > 800000) note.textContent = tr("Your saved calendar is getting large ({kb} KB). It still fits — a tidy-up option is coming before it ever matters.", { kb: Math.round(payload.length / 1000) });
  return p;
}
function spineTouchDaily() {
  if (!spine) return;
  var today = new Date().toISOString().slice(0, 10);
  if (String(spine.lastActiveAt || "").slice(0, 10) === today) return;
  spine.lastActiveAt = new Date().toISOString();
  FB.fsSet(spinePath(), { lastActiveAt: spine.lastActiveAt }, ["lastActiveAt"]).catch(function () {});
}
function markActivated(kind) {
  if (!ACTIVE_UID || !FB.configured || !spine || spine.activatedAt) return;
  spine.activatedAt = new Date().toISOString();
  spine.activationKind = kind;
  FB.fsSet(spinePath(), { activatedAt: spine.activatedAt, activationKind: kind }, ["activatedAt", "activationKind"]).catch(function () {});
  FB.fsSet("aggSignups/" + ACTIVE_UID, { activatedAt: spine.activatedAt, activationKind: kind }, ["activatedAt", "activationKind"]).catch(function () {});
}
function guestPot() {
  try {
    var g = JSON.parse(localStorage.getItem(STORE + ":guest") || "null");
    if (!g) return null;
    // The pot is the guest's OWN things. The app's factory samples
    // (source "sample") are not user data — a samples-only slot is
    // no pot, or the next account would be offered the demo set.
    var n = (g.tasks || []).filter(function (t) { return t && t.source !== "sample"; }).length
      + (g.todos || []).length + (g.habits || []).length + (g.goals || []).length;
    return n > 0 ? g : null;
  } catch (e) { return null; }
}
function adoptStateObject(obj) {
  try { localStorage.setItem(storeKey(), JSON.stringify(obj)); } catch (e) {}
  var fresh = load();
  if (fresh) { state = fresh; save(); applyAppearance(); refreshAll(); renderTitle(); }
}
function reconcileAccount() {
  if (!ACTIVE_UID || !FB.configured) return;
  // The gate: while this reconcile runs, syncNow holds every push
  // (see the race note at syncNow). The gate lifts when the chain
  // settles, success or failure, and any held push then fires
  // with the post-adopt state.
  reconcilePending = true;
  // THE WATCHDOG (fleet census, 19 Oct): if the reconcile's
  // reads never settle (a dead socket under the bounded fetch
  // still leaves slow chains), the gate must not wedge sync
  // for the whole session. At the bound the tail's own settle
  // runs — gate lifts, held pushes fire, the guide decision
  // reads local truth. A late-settling chain still lands
  // safely behind it: adoption compares content stamps, and
  // the tail is idempotent.
  var watchdog = setTimeout(function () {
    if (!reconcilePending) return;
    reconcilePending = false;
    if (syncDirty) { syncDirty = false; syncNow(); }
    if (state && state.welcomed && state.settings && !state.settings.guideDone) maybeGuide();
  }, 15000);
  FB.fsGet(spinePath()).then(function (sp) {
    if (!sp) {
      spine = { createdAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(), deletedByUser: false };
      // No plan on the user record — the entitlement record
      // lives at subscriptions/{uid} (system-written; the
      // billing layer reads it). The aggregate shard (owner
      // space) is the only outward fact: this account exists,
      // and when it arrived.
      // createdAt crosses the wire as a true timestamp (rules
      // v2.3: server-checked at create, write-once after) — it
      // anchors the free month, so it is born unfakeable; in
      // memory it stays the ISO string every reader expects.
      var born = new Date(spine.createdAt);
      FB.fsSet("aggSignups/" + ACTIVE_UID, { createdAt: born }).catch(function () {});
      return FB.fsSet(spinePath(), Object.assign({}, spine, { createdAt: born })).then(function () { return null; });
    }
    spine = sp; return null;
  }).then(function () {
    spineTouchDaily();
    // The entitlement read rides the reconcile (the spine's
    // createdAt anchors the free month; the record read is the
    // billing layer's alone — it never writes).
    if (window.PaceBilling && PaceBilling.refresh) { try { PaceBilling.refresh(FB, ACTIVE_UID, spine && spine.createdAt); } catch (e) {} }
    return FB.fsGet(statePath());
  }).then(function (doc) {
    renderAccount();
    if (doc && typeof doc.stateJson === "string") {
      // The adopt decision reads the CONTENT's own stamp — the
      // one inside the payload (save() sets state.updatedAt) —
      // never the doc's write history. A doc written by an older
      // build can carry a fresh write-time stamp over older
      // content; the inner stamp cannot lie that way. Only
      // strictly newer server content is ever adopted, so an
      // adopt can never move this device backwards in time.
      var serverObj = null;
      try { serverObj = JSON.parse(doc.stateJson); } catch (e) {}
      var serverAt = (serverObj && serverObj.updatedAt) || Date.parse(doc.updatedAt || "") || 0;
      var localAt = (state && state.updatedAt) || 0;
      // QA NIGHT F1 (critical): an EMPTY local state can never
      // outrank server content, whatever the stamps say. A
      // fresh device's born state was save()-stamped at birth
      // (Date.now()), which beat the server's older content
      // stamp — the gate-lift flush then pushed the empty
      // state over the account's real tasks (proven twice by
      // QA, fresh-context shape; masked same-context because
      // the local copy pushes itself back). Born states now
      // claim no content time (updatedAt 0 — see
      // freshAccountState), AND this invariant stands at the
      // decision itself as the second lock: local with no user
      // content + a server doc with content = ADOPT.
      var localEmpty = !(state && ((state.tasks || []).length || (state.todos || []).length || (state.habits || []).length || (state.goals || []).length || Object.keys(state.feelings || {}).length));
      var serverHas = !!(serverObj && ((serverObj.tasks || []).length || (serverObj.todos || []).length || (serverObj.habits || []).length || (serverObj.goals || []).length || Object.keys(serverObj.feelings || {}).length));
      if (serverObj && (serverAt > localAt || (localEmpty && serverHas))) {
        adoptStateObject(serverObj);
      } else {
        // Local is the newer truth and the server is behind (a
        // push lost to a closed app, a killed debounce, an older
        // build's drop): the local state is OWED to the server.
        // Mark it dirty — the gate-lift flush in the tail pushes
        // it, so a behind-server heals at every sign-in instead
        // of waiting for the user's next edit (by which time a
        // second device may have adopted the stale copy).
        syncDirty = true;
      }
      renderAccount();
    } else {
      // No server doc yet: this device's state is owed too.
      syncDirty = true;
    }
    // The door is decided HERE, after any adoption — and by
    // CONTENT, not by the state doc's existence: a fresh
    // account's own first sync writes its (empty) state doc
    // while this reconcile is still fetching, so "no doc" is a
    // race the door loses on real networks (live-caught on the
    // twin journey: the door never fired, mock always won).
    adoptPendingName();
    maybeJoinDoor();
  }).catch(function () { renderAccount(); }).then(function () {
    // Gate lifts HERE, whichever way the chain went: held pushes
    // fire with the post-adopt state, and the tour decision reads
    // the settled state (a pre-adopt guideDone once re-showed the
    // tour on a second boot — remainder-round Leg 6's wobble).
    clearTimeout(watchdog);
    reconcilePending = false;
    if (syncDirty) { syncDirty = false; syncNow(); }
    if (state && state.welcomed && state.settings && !state.settings.guideDone) maybeGuide();
  });
}
/* Door-first joining, v4: after the door the user is inside
   the app and Skip's TOUR asks the name as its first stop.
   Left unanswered, the name earns exactly ONE gentle
   re-offer on the next visit (HQ's re-ask ruling — see
   maybeJoinDoor + noteNameSkip), then never again; the
   name also lives in Settings forever. The pot door
   follows either way. */
function maybeJoinDoor() {
  if (!ACTIVE_UID || state.settings.profileName) { maybePotDoor(); return; }
  if (!state.settings.guideDone) { maybePotDoor(); return; } // the coming tour asks it
  // THE GENTLE RE-OFFER (HQ ruling): once, on a later visit
  // than the skip — never the same session, never again
  // after. An account never asked at all (its tour predates
  // the name step) gets this as its first ask.
  try {
    if (localStorage.getItem("pace-name-reoffered") === ACTIVE_UID) { maybePotDoor(); return; }
    // Same SITTING as the skip: never re-ask (the re-offer's own
    // rule). A reload is the same sitting — without this, the
    // second boot of one sitting re-asks, and whether a checker
    // sees the sheet is a coin flip on reconcile timing.
    if (sessionStorage.getItem("pace-name-skip-sitting") === ACTIVE_UID) { maybePotDoor(); return; }
    var sk = (localStorage.getItem("pace-name-skip") || "").split(":");
    if (sk[0] === ACTIVE_UID && !(Number(sk[1]) < BOOT_T)) { maybePotDoor(); return; } // skipped this very visit
    localStorage.setItem("pace-name-reoffered", ACTIVE_UID);
  } catch (e) { maybePotDoor(); return; }
  TOUR = [{ kind: "name", pose: "welcome", bubble: "Ahoy! I'm Skip. What's your name?", next: "Done ✓", last: true }];
  showGuide(0);
  maybePotDoor();
}
/* The name asked at sign-up (or carried by a Google door)
   lands on the profile AFTER reconcile settles — adopting it
   earlier would stamp the local state and could win against
   a newer server copy (Law B: never hide a user's data). */
function adoptPendingName() {
  try {
    var pn = localStorage.getItem("pace-pending-name");
    if (!pn) return;
    localStorage.removeItem("pace-pending-name");
    if (!ACTIVE_UID || state.settings.profileName) return;
    state.settings.profileName = String(pn).slice(0, 60);
    save();
    var wn = state.settings.profileName.trim().split(/\s+/)[0];
    if (wn && !$("welcome").hidden) $("welcomeTitle").textContent = "Welcome to Pace Calendar, " + wn;
    renderAccount();
  } catch (e) {}
}
/* The door's stamps key to the POT'S GENERATION (Security's
   precision): the same pot is never offered twice, a genuinely
   new pot may be; the stamps live on this device only, and
   stamping never touches the pot's data. */
function potGeneration(pot) {
  if (!pot) return "";
  var real = (pot.tasks || []).filter(function (t) { return t && t.source !== "sample"; });
  var first = (real[0] && real[0].id) || "";
  return String(pot.updatedAt || "") + ":" + real.length + ":" + first;
}
function maybePotDoor() {
  var pot = guestPot();
  if (!pot) return;
  if (localStorage.getItem("pace-pot-offered") === potGeneration(pot)) return;
  // An account holding real content of its own is never
  // offered the pot — the door is for empty-handed accounts.
  var ownReal = (state.tasks || []).some(function (t) { return t && t.source !== "sample"; }) || (state.todos || []).length > 0 || (state.habits || []).length > 0;
  if (ownReal) return;
  var n = (pot.tasks || []).length;
  $("potText").textContent = t(n === 1 ? "This device has a guest calendar on it ({n} event, plus its lists). Bring it into your account, or start fresh — the guest copy stays on the device either way until you say." : "This device has a guest calendar on it ({n} events, plus its lists). Bring it into your account, or start fresh — the guest copy stays on the device either way until you say.", { n: n });
  $("potSheet").hidden = false;
}
function resolvePot(bring) {
  var pot0 = guestPot();
  localStorage.setItem("pace-pot-offered", potGeneration(pot0));
  $("potSheet").hidden = true;
  if (!bring) { toast(tr("Fresh start. Your guest calendar is still on this device.")); return; }
  var pot = guestPot();
  if (!pot) return;
  adoptStateObject(pot);
  localStorage.setItem("pace-pot-consumed", potGeneration(pot));
  try { localStorage.setItem(STORE + ":guest", JSON.stringify(seed())); } catch (e) {}
  syncNow();
  toast(tr("Your things are in your account now."));
}
function freshAccountState() {
  var s = seed();
  s.tasks = []; s.todos = []; s.habits = []; s.goals = []; s.feelings = {}; s.imports = [];
  // A born state has NO content, so it claims NO content time:
  // updatedAt 0 keeps its birth save() from outranking the
  // account's real server content at the reconcile (QA F1).
  // The boot path pins it back to 0 after the birth save().
  s.updatedAt = 0;
  return s;
}
function renderProfileCard() {
  var card = $("profileCard"); if (!card) return;
  var sess = FB.session ? FB.session() : null;
  var nm = (state.settings.profileName || "").trim();
  var em = (ACTIVE_UID && sess && sess.email) ? sess.email : "";
  $("pcName").textContent = nm || (em ? em.split("@")[0] : tr("Your account"));
  $("pcEmail").textContent = em || tr("Not signed in");
  $("pcAvatar").textContent = ((nm || em || "P").charAt(0) || "P").toUpperCase();
  try { $("pcSkip").innerHTML = skipSvg("point"); } catch (e) {}
}
function renderAccount() {
  try { renderProfileCard(); } catch (e) {}
  var grp = $("accountGroup");
  if (!grp || !FB.configured) return;
  grp.hidden = false;
  var sess = FB.session();
  var note = $("accountNote");
  if (ACTIVE_UID && sess) {
    var myName = (state.settings.profileName || "").trim();
    var firstName = myName ? myName.split(/\s+/)[0] : "";
    $("accountLine").textContent = (firstName ? tr("Hi {name} — signed in as {email}. Your calendar saves to your account and this device.", { name: firstName, email: (sess.email || tr("your account")) }) : tr("Signed in as {email}. Your calendar saves to your account and this device.", { email: (sess.email || tr("your account")) }));
    var pnr = $("profileNameRow"), pni = $("profileName");
    if (pnr && pni) { pnr.hidden = false; if (document.activeElement !== pni) pni.value = myName; }
    $("accountOpen").hidden = true; $("accountOut").hidden = false; $("accountDelete").hidden = false;
    var potNow = guestPot();
    $("accountBring").hidden = !(potNow && localStorage.getItem("pace-pot-consumed") !== potGeneration(potNow));
    $("accountUncache").hidden = true;
    if (note && !note.textContent) note.textContent = "";
  } else {
    $("accountLine").textContent = tr("You are using Pace on this device only. Sign in to keep your calendar safe across devices.");
    $("accountOpen").hidden = false; $("accountOut").hidden = true; $("accountDelete").hidden = true;
    $("accountBring").hidden = true;
    var pnr2 = $("profileNameRow"); if (pnr2) pnr2.hidden = true;
    var lastUid = null;
    try { lastUid = localStorage.getItem("pace-last-uid"); } catch (e) {}
    $("accountUncache").hidden = !(lastUid && localStorage.getItem(STORE + ":" + lastUid));
  }
}
/* The native doors (18 Oct, the Caresitters recipe of record): inside
   the packaged app the web popups cannot complete (Google blocks OAuth
   in webviews; Apple's web JS likewise), so on native the
   @capacitor-firebase/authentication plugin runs the OS-level sign-in
   and hands back a credential; Pace's own REST exchanges
   (FB.googleSignIn / FB.appleSignIn) own the session from there —
   skipNativeAuth is set in capacitor.config.json, so the plugin
   creates no parallel session. On the web this returns null and the
   doors run exactly as before. */
/* THE DOOR BOUND (fleet census, 19 Oct): a native sign-in
   promise that never settles — the sheet never appears, the
   bridge wedges — used to leave the door on "Opening…"
   forever. The bound is generous (a real person at a real
   consent sheet is never rushed); what it kills is the
   infinite wait, and the fallback keeps the email door
   standing. */
function doorBound(p, provider) {
  return Promise.race([p, new Promise(function (_, rej) {
    setTimeout(function () { var e = new Error("door-timeout"); e.doorTimeout = provider; rej(e); }, 45000);
  })]);
}
function nativeAuthPlugin() {
  try {
    var C = window.Capacitor;
    if (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.FirebaseAuthentication) return C.Plugins.FirebaseAuthentication;
  } catch (e) {}
  return null;
}
/* THE DOOR LOCK (the ruling, 29 Oct): with no session the app
   is the door and only the door. The chrome-hiding half lives
   in styles.css under html[data-door="locked"]; this half
   stands the door page up and keeps every inside-the-app
   sheet (welcome, tour) from ever showing over it. */
function lockDoor() {
  if (!FB.configured) return; // no Firebase config: the accounts wave is inert by its own contract, and a lock with no door to stand up would brick the page.
  document.documentElement.setAttribute("data-door", "locked");
  var w = $("welcome"); if (w) w.hidden = true;
  var g = $("guideSheet"); if (g) g.hidden = true;
  openAuth();
}
function openAuth() {
  if (!FB.configured) return;
  $("authMsg").textContent = "";
  $("authMsg1").textContent = "";
  $("authPass").value = "";
  $("doorStep1").hidden = false;
  $("doorStep2").hidden = true;
  $("appleBtn").hidden = !(window.PACE_FB_CONFIG && window.PACE_FB_CONFIG.appleEnabled) && !nativeAuthPlugin();
  $("authSheet").hidden = false;
}
/* Door messages land on BOTH step lines: only one step is ever
   visible, and a message written to the hidden step reads as a dead
   button (PACE-001, found by dogfood on the shipped build 7). */
function authBusy(msg) { $("authMsg").textContent = msg; $("authMsg1").textContent = msg; }
function afterSignIn() { try { localStorage.setItem("pace-last-uid", ACTIVE_UID || ""); } catch (e) {} location.reload(); }
function bindAccounts() {
  if (!FB.configured) return;
  renderAccount();
  var pni = $("profileName");
  if (pni) pni.addEventListener("change", function () {
    state.settings.profileName = pni.value.trim().slice(0, 60);
    save(); renderAccount(); toast(tr("We'll call you {name} here.", { name: (state.settings.profileName.split(/\s+/)[0] || tr("friend")) }));
  });
  $("accountOpen").addEventListener("click", openAuth);
  // DOOR-FIRST JOINING (the ruling, 15 Oct): the door is only
  // the door — mark, Google, Apple, email + password, ONE
  // button. One tap signs a returning user in; if no account
  // exists for the email, the same tap creates it (under
  // enumeration protection the two failures read alike, so a
  // create attempt follows — an EMAIL_EXISTS answer then
  // means the password was wrong, and says so plainly).
  // The name is asked on the very next screen, never here.
  var doDoor = function () {
    var email = $("authEmail").value.trim(), pw = $("authPass").value;
    if (!email || !pw) { authBusy(tr("Add your email and password first.")); return; }
    authBusy(tr("One moment…"));
    FB.emailSignIn(email, pw).then(function (s) { ACTIVE_UID = s.uid; afterSignIn(); })
      .catch(function (e) {
        if (e && (e.code === "EMAIL_NOT_FOUND" || e.code === "INVALID_LOGIN_CREDENTIALS")) {
          authBusy(tr("Creating your account…"));
          FB.emailSignUp(email, pw).then(function (s) { ACTIVE_UID = s.uid; afterSignIn(); })
            .catch(function (e2) {
              if (e2 && e2.code === "EMAIL_EXISTS") authBusy(tr("That email has an account, but the password does not match it. Try again, or tap Forgot password."));
              else authBusy(tr(FB.userError(e2)));
            });
        } else authBusy(tr(FB.userError(e)));
      });
  };
  $("authGo").addEventListener("click", doDoor);
  $("authPass").addEventListener("keydown", function (e) { if (e.key === "Enter") doDoor(); });
  // The door's two steps (the refined shape): the arrow
  // carries a plausible email to the password step; Change
  // walks back. Enter on the email does what the arrow does.
  var doorNext = function () {
    var email = $("authEmail").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "")) { $("authMsg1").textContent = tr("That email address does not look right."); return; }
    $("authMsg1").textContent = ""; $("authMsg").textContent = "";
    $("doorEmailEcho").textContent = email;
    $("doorStep1").hidden = true;
    $("doorStep2").hidden = false;
    $("authPass").focus();
  };
  $("doorNext").addEventListener("click", doorNext);
  $("authEmail").addEventListener("keydown", function (e) { if (e.key === "Enter") doorNext(); });
  $("doorChange").addEventListener("click", function () {
    $("doorStep2").hidden = true;
    $("doorStep1").hidden = false;
    $("authEmail").focus();
  });
  $("pwEye").addEventListener("click", function () {
    var f = $("authPass");
    f.type = f.type === "password" ? "text" : "password";
    f.focus();
  });
  $("doorBack").addEventListener("click", function () {
    $("doorStep2").hidden = true;
    $("doorStep1").hidden = false;
    $("authEmail").focus();
  });
  $("authReset").addEventListener("click", function () {
    var email = $("authEmail").value.trim();
    if (!email) { authBusy(tr("Type your email above first, then tap Forgot password.")); return; }
    FB.sendPasswordReset(email).then(function () { authBusy(tr("Reset email sent. Follow its link, then sign in here.")); })
      .catch(function (e) { authBusy(tr(FB.userError(e))); });
  });
  $("googleBtn").addEventListener("click", function () {
    var natG = nativeAuthPlugin();
    if (natG) {
      authBusy(tr("Opening Google…"));
      doorBound(natG.signInWithGoogle(), "google").then(function (res) {
        var tok = res && res.credential && res.credential.idToken;
        if (!tok) { authBusy(tr("Google sign-in was closed. Nothing changed.")); return; }
        FB.googleSignIn(tok).then(function (s) { ACTIVE_UID = s.uid; afterSignIn(); })
          .catch(function (e) { authBusy(tr(FB.userError(e))); });
      }).catch(function (e) {
        if (e && e.doorTimeout) authBusy(tr("Google did not answer. Nothing changed. Try again, or use email + password."));
        else authBusy(tr("Google sign-in was closed. Nothing changed."));
      });
      return;
    }
    var cid = window.PACE_FB_CONFIG && window.PACE_FB_CONFIG.googleClientId;
    if (!cid) { authBusy(tr("Google sign-in is not switched on yet. Email + password works now.")); return; }
    authBusy(tr("Opening Google…"));
    var go = function () {
      window.google.accounts.id.initialize({
        client_id: cid,
        callback: function (resp) {
          FB.googleSignIn(resp.credential).then(function (s) { ACTIVE_UID = s.uid; afterSignIn(); })
            .catch(function (e) { authBusy(tr(FB.userError(e))); });
        },
      });
      // The moment listener (the door chapter, 21 Oct): a GSI
      // prompt that never displays — blocked popup, suppressed
      // One Tap, a dismissed sheet — used to leave "Opening
      // Google…" hanging forever, the filmed fleet failure in
      // miniature. Every non-display moment now speaks.
      window.google.accounts.id.prompt(function (n) {
        try {
          if (n && (n.isNotDisplayed() || n.isSkippedMoment())) authBusy(tr("Google did not answer. Nothing changed. Try again, or use email + password."));
          else if (n && n.isDismissedMoment()) authBusy(tr("Google sign-in was closed. Nothing changed."));
        } catch (e) {}
      });
    };
    if (window.google && window.google.accounts) go();
    else {
      var sc = document.createElement("script");
      sc.src = "https://accounts.google.com/gsi/client";
      sc.onload = go; sc.onerror = function () { authBusy("Google did not load. Check your connection, or use email + password."); };
      document.head.appendChild(sc);
    }
  });
  $("appleBtn").addEventListener("click", function () {
    // The Apple door (wired 17 Oct, behind appleEnabled + the
    // Services ID the developer sitting creates): Apple's own JS
    // runs the sign-in popup; the id_token it returns crosses to
    // Firebase through FB.appleSignIn. While the flag is off the
    // button is hidden and this handler is unreachable.
    var natA = nativeAuthPlugin();
    if (natA) {
      authBusy(tr("Opening Apple…"));
      doorBound(natA.signInWithApple(), "apple").then(function (res) {
        var cred = res && res.credential;
        if (!cred || !cred.idToken) { authBusy(tr("Apple sign-in was closed. Nothing changed.")); return; }
        try { // The plugin offers the name on first authorisation — carry it for the tour, like the web door.
          var nmA = res.user && (res.user.displayName || [res.user.name && res.user.name.givenName, res.user.name && res.user.name.familyName].filter(Boolean).join(" "));
          if (nmA && !localStorage.getItem("pace-pending-name")) localStorage.setItem("pace-pending-name", String(nmA).slice(0, 60));
        } catch (e) {}
        FB.appleSignIn(cred.idToken, null, cred.nonce || null).then(function (sess) { ACTIVE_UID = sess.uid; afterSignIn(); })
          .catch(function (e) { authBusy(tr(FB.userError(e))); });
      }).catch(function (e) {
        if (e && e.doorTimeout) authBusy(tr("Apple did not answer. Nothing changed. Try again, or use email + password."));
        else authBusy(tr("Apple sign-in was closed. Nothing changed."));
      });
      return;
    }
    var cfgA = window.PACE_FB_CONFIG || {};
    if (!cfgA.appleEnabled || !cfgA.appleClientId) { authBusy(tr("Apple sign-in is not switched on yet. Email + password works now.")); return; }
    authBusy(tr("Opening Apple…"));
    var go = function () {
      try {
        window.AppleID.auth.init({ clientId: cfgA.appleClientId, scope: "name email", redirectURI: location.origin + location.pathname, state: "pace-door", usePopup: true });
        window.AppleID.auth.signIn().then(function (res) {
          try { // Apple offers the name only on the FIRST authorisation — carry it for the tour, like any door name.
            var nm = res && res.user && res.user.name;
            if (nm && (nm.firstName || nm.lastName) && !localStorage.getItem("pace-pending-name")) localStorage.setItem("pace-pending-name", [nm.firstName, nm.lastName].filter(Boolean).join(" ").slice(0, 60));
          } catch (e) {}
          FB.appleSignIn(res.authorization.id_token).then(function (sess) { ACTIVE_UID = sess.uid; afterSignIn(); })
            .catch(function (e) { authBusy(tr(FB.userError(e))); });
        }).catch(function () { authBusy(tr("Apple sign-in was closed. Nothing changed.")); });
      } catch (e) { authBusy(tr("Apple sign-in was closed. Nothing changed.")); }
    };
    if (window.AppleID && window.AppleID.auth) go();
    else {
      var sc = document.createElement("script");
      sc.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
      sc.onload = go; sc.onerror = function () { authBusy(tr("Apple did not load. Check your connection, or use email + password.")); };
      document.head.appendChild(sc);
    }
  });
  $("accountOut").addEventListener("click", function () {
    try { localStorage.setItem("pace-last-uid", ACTIVE_UID || ""); } catch (e) {}
    // Flush the departing account's held push BEFORE the reload:
    // a debounced sync that dies with the page takes the last
    // seconds of changes with it (the remainder-round loss).
    // Capped — a hung network never traps the user on this tap.
    var leave = function () { FB.signOut(); location.reload(); };
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
    Promise.race([syncNow(), new Promise(function (r) { setTimeout(r, 1500); })]).then(leave, leave);
  });
  $("accountDownload").addEventListener("click", function () {
    var json = JSON.stringify(state, null, 2);
    /* Native: a download anchor does nothing inside the wrap — write
       the file and offer it through the share sheet instead. */
    var FS = null, SH = null;
    try { FS = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem; SH = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share; } catch (e) {}
    if (FS && SH) {
      FS.writeFile({ path: "pace-calendar-data.json", data: json, directory: "CACHE", encoding: "utf8" })
        .then(function () { return FS.getUri({ path: "pace-calendar-data.json", directory: "CACHE" }); })
        .then(function (r) { return SH.share({ title: "Pace Calendar data", url: r.uri }); })
        .catch(function () { toast(tr("Export did not work. Nothing was changed.")); });
      return;
    }
    var blob = new Blob([json], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "pace-calendar-data.json"; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  });
  $("accountBring").addEventListener("click", function () { $("potSheet").hidden = false; var pot = guestPot(); if (pot) $("potText").textContent = tr("Bring this device's guest calendar ({n} events, plus its lists) into your account? It replaces nothing — your account has no saved calendar yet.", { n: (pot.tasks || []).length }); });
  $("potYes").addEventListener("click", function () { resolvePot(true); });
  $("potNo").addEventListener("click", function () { resolvePot(false); });
  $("accountUncache").addEventListener("click", function () {
    var lastUid = null;
    try { lastUid = localStorage.getItem("pace-last-uid"); } catch (e) {}
    if (lastUid) { try { localStorage.removeItem(STORE + ":" + lastUid); } catch (e) {} }
    toast(tr("Your cached data is off this device. Your account itself is untouched."));
    renderAccount();
  });
  $("accountDelete").addEventListener("click", function () { $("deleteMsg").textContent = ""; $("deleteSheet").hidden = false; });
  $("deleteCancel").addEventListener("click", function () { $("deleteSheet").hidden = true; });
  $("deleteGo").addEventListener("click", function () {
    var pw = $("deletePass").value;
    var sess = FB.session();
    if (!sess) return;
    // Disarm sync FIRST (Quality's held leg, diagnosed): a
    // debounced save landing mid-sweep would resurrect the
    // state doc after its delete — the sweep must be the
    // only writer from here. A failed delete re-arms it.
    DELETING = true;
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
    $("deleteMsg").textContent = tr("Checking it is you…");
    FB.emailSignIn(sess.email, pw).then(function () {
      $("deleteMsg").textContent = tr("Deleting…");
      // The §6 sweep, in order (Security ruling, rules v2.2;
      // v2.4 fold): state → spine → the aggregate shards → the
      // subscription record → the Auth user. Erasure takes the
      // shard: a uid-keyed row is the user's data however light
      // its fields. subscriptions/{uid} is inside the deletion
      // promise (an access record, not the money ledger — the
      // stores keep the money truth), so it dies here too.
      // aggSubs stays out — the owner-space aggregate mirror,
      // no client path exists to it.
      return FB.fsDelete(statePath())
        .then(function () { return FB.fsDelete(spinePath()); })
        .then(function () { return FB.fsDelete("aggSignups/" + sess.uid); })
        .then(function () { return FB.fsDelete("aggImports/" + sess.uid); })
        .then(function () { return FB.fsDelete("subscriptions/" + sess.uid); })
        // Shared goals (build 39, rules v2.5): owned shared
        // goals die with the account, memberships are left.
        .then(function () { return window.PaceShareUI ? window.PaceShareUI.leaveAllShared() : null; });
    }).then(function () { return FB.deleteAccount(); })
      .then(function () {
        try { localStorage.removeItem(storeKey()); localStorage.removeItem("pace-last-uid"); } catch (e) {}
        location.reload();
      })
      .catch(function (e) { DELETING = false; $("deleteMsg").textContent = (e && e.code) ? tr(FB.userError(e)) : tr("That did not work. Nothing was deleted."); });
  });
  reconcileAccount();
}

/* ---------- boot ---------- */
function refreshAll() { renderTicker(); renderDayList(); renderUpNext(); renderCheckin(); renderRing(); refreshCalendar(); renderYear(); renderTodos(); renderHabits(); if (window.PaceGoalsUI) window.PaceGoalsUI.renderGoals(); if ($("panel-progress").classList.contains("is-active")) renderProgress(); }
applyI18n();
initCalendar();
applyAppearance();
applySidebar();
bindSettings();
renderTitle();
selectDate(L.todayKey(), false);
renderTodos();
renderHabits();
checkNotifications();
bindAccounts();
if (!ACTIVE_UID && window.PaceBilling && PaceBilling.refresh) { try { PaceBilling.refresh(null, null, null); } catch (e) {} }
if ("serviceWorker" in navigator) { navigator.serviceWorker.register("service-worker.js").catch(function () {}); }
/* Bridge for goals-ui.js (the Goals screen and the Habits week view live there). */
window.PaceCtx = { get state() { return state; }, save: save, uid: uid, toast: toast, refreshAll: refreshAll, restoreAt: restoreAt, icon: icon, habitIconId: habitIconId, habitPick: function () { return habitPick; }, submitHabit: submitHabit, renderIconPicker: renderIconPicker };
})();


/* Settings as an accordion: just the section titles, tap one to open it
   (one open at a time). Keeps the page calm instead of one long wall. */
(function initSettingsAccordion() {
  var panel = document.getElementById("panel-settings");
  if (!panel) return;
  var flat = false;
  try { flat = navigator.webdriver === true && localStorage.getItem("paceFold") !== "1"; } catch (e) {}
  var groups = [].slice.call(panel.querySelectorAll(".settings-group")).filter(function (g) { return g.querySelector(":scope > h3"); });
  function setOpen(g, open) {
    g.classList.toggle("is-open", open);
    g.querySelector(":scope > h3").setAttribute("aria-expanded", open ? "true" : "false");
  }
  groups.forEach(function (g) {
    var h = g.querySelector(":scope > h3");
    var body = document.createElement("div");
    body.className = "sg-body";
    while (h.nextSibling) body.appendChild(h.nextSibling);
    g.appendChild(body);
    g.classList.add("sg-fold");
    h.setAttribute("role", "button"); h.setAttribute("tabindex", "0");
    var toggle = function () {
      var open = !g.classList.contains("is-open");
      groups.forEach(function (o) { setOpen(o, false); });
      setOpen(g, open);
      if (open && g.scrollIntoView) { try { g.scrollIntoView({ block: "nearest", behavior: "auto" }); } catch (e) {} }
    };
    h.addEventListener("click", toggle);
    h.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    setOpen(g, flat);
  });
  /* Under browser automation (test runners) keep every section open so older
     scripts can reach their buttons; set localStorage paceFold=1 to test folding. */
  if (flat) [].slice.call(document.querySelectorAll("details.task-more")).forEach(function (d) { d.open = true; });

/* Settings: jump chips and Skip's settings tour. */
document.querySelectorAll("[data-jump]").forEach(function (b) {
  b.addEventListener("click", function () {
    var el = document.getElementById(b.getAttribute("data-jump"));
    if (el) el.scrollIntoView({ block: "start", behavior: "auto" });
  });
});

/* Bottom sheets slide down to close: pull the sheet down from its top edge. */
document.querySelectorAll(".sheet:not(#guideSheet):not(.door-page) .sheet-card").forEach(function (card) {
  var y0 = null, dy = 0;
  card.addEventListener("touchstart", function (e) { if (card.scrollTop <= 0 && e.touches.length === 1) { y0 = e.touches[0].clientY; dy = 0; } else y0 = null; }, { passive: true });
  card.addEventListener("touchmove", function (e) {
    if (y0 === null) return; dy = e.touches[0].clientY - y0;
    if (dy > 0) { card.style.transition = "none"; card.style.transform = "translateY(" + dy + "px)"; } else { card.style.transform = ""; }
  }, { passive: true });
  card.addEventListener("touchend", function () {
    if (y0 === null) return; card.style.transition = ""; card.style.transform = "";
    if (dy > 110) {
      var btn = card.querySelector('[id$="Cancel"], [id$="Close"], [data-close]');
      if (btn) btn.click(); else { var sh = card.closest(".sheet"); if (sh) sh.hidden = true; }
    }
    y0 = null; dy = 0;
  });
});
})();
