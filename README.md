# Respuesta a las Recomendaciones de Mejora del Proyecto

Este documento detalla la evaluación técnica, el plan de implementación y las justificaciones de diseño respecto a las recomendaciones de mejora para el sistema de detección y monitoreo de mascotas en áreas residenciales privadas.

---

## 1. Implementación de Beacons BLE (iBeacon/Eddystone) con Deep Sleep en el Collar

Se considera pertinente implementar esta recomendación, ya que uno de los objetivos del ESP32-C3 dentro del collar es mantener un tamaño reducido y un bajo consumo energético. Actualmente, el proyecto contempla el **ESP32-C3 SuperMini** precisamente por sus características de bajo consumo y reducido tamaño.

Como mejora, se modificará el funcionamiento del collar para utilizar **BLE Advertising no conectable**, transmitiendo principalmente un identificador único asociado a cada mascota. El ESP32-C3 entrará en *Deep Sleep* entre períodos de transmisión, reduciendo así el consumo de batería.

El identificador transmitido será utilizado posteriormente por la ESP32-CAM y el servidor para consultar la información correspondiente en la base de datos. De esta manera, no será necesario transmitir constantemente información como el nombre del propietario o la residencia.

### Implementación propuesta:
1. Configurar el ESP32-C3 como transmisor BLE.
2. Asignar un identificador único a cada collar.
3. Utilizar BLE Advertising no conectable.
4. Configurar intervalos de transmisión de aproximadamente 1 a 2 segundos.
5. Utilizar *Deep Sleep* entre períodos de actividad.
6. Registrar el nivel de batería del collar.
7. Asociar el identificador BLE con la mascota y el propietario mediante la base de datos.

> ### Lo que no cambiaríamos:
> No cambiaríamos el uso del **ESP32-C3 SuperMini** como plataforma del collar, debido a que su tamaño y bajo consumo son adecuados para un dispositivo que debe ser transportado por una mascota. Tampoco consideramos necesario implementar una conexión BLE permanente, ya que aumentaría el consumo energético y no es necesaria para el objetivo principal de identificación por proximidad.

---

## 2. Filtrado y Calibración por RSSI para Evitar Falsos Positivos

Se acepta esta recomendación y se incorporará al sistema como un mecanismo de filtrado de proximidad. Actualmente, el proyecto plantea detectar mediante Bluetooth a las mascotas que se encuentren dentro del perímetro de una residencia.

Para mejorar la precisión de esta detección, la ESP32-CAM analizará el **RSSI (Received Signal Strength Indicator)** de las señales BLE recibidas. Inicialmente se utilizará un umbral de referencia de aproximadamente `-65 dBm`, pero este valor será calibrado mediante pruebas físicas en el entorno real del proyecto.

La ESP32-CAM no tomará una fotografía únicamente porque haya detectado un identificador BLE. Primero verificará si la intensidad de señal se encuentra dentro del rango establecido.

### Implementación propuesta:
1. La ESP32-CAM inicia un escaneo BLE.
2. Detecta el identificador del collar.
3. Obtiene el valor RSSI.
4. Compara el RSSI con el umbral configurado.
5. Si la señal está dentro del rango aceptable, continúa con el proceso.
6. Si la señal es demasiado débil, descarta el evento.
7. Se podrá utilizar un promedio móvil de varias lecturas para evitar decisiones basadas en una única medición.

> ### Lo que no cambiaríamos:
> No utilizaríamos el RSSI como un sistema de localización exacta. El RSSI solamente se utilizará como indicador de proximidad, ya que factores como paredes, obstáculos, orientación de la antena e interferencias pueden modificar la intensidad de la señal.
> 
> Por esta razón, tampoco estableceríamos definitivamente el valor de `-65 dBm` sin realizar las pruebas correspondientes. Se utilizará inicialmente como referencia y posteriormente se ajustará según los resultados obtenidos.

---

## 3. Adición de un Sensor PIR como Disparador Combinado

Se considera conveniente incorporar un sensor PIR para mejorar el consumo energético y reducir activaciones innecesarias de la cámara.

La ESP32-CAM será utilizada como dispositivo principal de la residencia y actualmente se plantea que detecte los collares y capture evidencia visual. Con la incorporación del PIR, la cámara no tendrá que permanecer realizando procesos de detección constantemente; el PIR funcionará como un primer filtro de movimiento.

### Implementación propuesta:

```text
Movimiento
     ↓
Sensor PIR
     ↓
Activar escaneo BLE
     ↓
Detectar collar
     ↓
Comprobar RSSI
     ↓
¿Está dentro del rango?
     ↓
Capturar imagen
```

De esta manera, el PIR será utilizado como un disparador, mientras que BLE y RSSI serán utilizados para confirmar que el movimiento detectado está relacionado con una mascota que porta el collar.

> ### Lo que no cambiaríamos:
> No reemplazaríamos BLE por PIR. El PIR por sí solo no permite identificar qué mascota produjo el movimiento, ya que puede detectar personas, animales u otros movimientos.
> 
> Por lo tanto, consideramos que la combinación **PIR + BLE + RSSI** es más adecuada que utilizar únicamente uno de estos mecanismos.

---

## 4. Cola de Almacenamiento Local (Buffer Offline) ante Caídas de Wi-Fi

Se acepta esta recomendación y se incorporará al sistema debido a que actualmente la arquitectura depende de la conexión Wi-Fi para enviar información al servidor. El documento contempla el envío de datos e imágenes hacia una base de datos mediante Wi-Fi.

La ESP32-CAM cuenta con una ranura para tarjeta micro-SD, por lo que se aprovechará este recurso para implementar un almacenamiento temporal de los eventos.

Cuando se produzca una detección, el sistema generará un registro que contendrá:
* Identificador del collar.
* RSSI.
* Fecha y hora.
* Nivel de batería.
* Imagen capturada.
* Estado de sincronización.

Si existe conexión Wi-Fi, el evento será enviado inmediatamente al servidor. Si no existe conexión, se almacenará localmente en la micro-SD y se marcará como pendiente. Cuando se restablezca la conexión, la ESP32-CAM intentará enviar automáticamente los registros pendientes.

### Flujo propuesto:

```text
Captura
   ↓
Guardar evento
   ↓
¿Wi-Fi disponible?
  ↙             ↘
 NO              SÍ
 ↓                ↓
micro-SD       Servidor
 ↓
Cola pendiente
 ↓
Se recupera Wi-Fi
 ↓
Sincronización
```

> ### Lo que no cambiaríamos:
> No eliminaríamos la comunicación Wi-Fi ni reemplazaríamos la ESP32-CAM por otro dispositivo únicamente para solucionar este problema. La ESP32-CAM fue seleccionada porque integra cámara, Wi-Fi y Bluetooth, además de mantener un costo y tamaño adecuados para el proyecto.
> 
> La micro-SD se utilizará como buffer temporal, no como reemplazo de la base de datos principal.

---

## 5. Difuminado o Enmascaramiento Automático de Rostros

Se considera una mejora importante debido a que la cámara estará orientada hacia espacios exteriores y existe la posibilidad de capturar personas que no estén relacionadas con el objetivo del proyecto.

El documento ya contempla la protección de la privacidad y establece que las imágenes deben utilizarse exclusivamente como evidencia y almacenarse durante un tiempo limitado. Como mejora, se propone realizar el difuminado de rostros en el servidor antes de almacenar definitivamente las imágenes.

### Flujo de procesamiento:

```text
ESP32-CAM
    ↓
Captura imagen
    ↓
Servidor
    ↓
Detección de rostros
    ↓
Difuminado / máscara
    ↓
Almacenamiento
```

Se podrá utilizar una herramienta de procesamiento de imágenes como **OpenCV** para detectar los rostros presentes y aplicar un desenfoque antes de almacenar la imagen definitiva.

> ### Lo que no cambiaríamos:
> No realizaríamos inicialmente el procesamiento de rostros directamente en la ESP32-CAM, debido a las limitaciones de procesamiento del dispositivo y porque su función principal será detectar, capturar y transmitir la evidencia.
> 
> Además, no consideramos necesario implementar un sistema avanzado de reconocimiento facial. El objetivo del proyecto es identificar mascotas mediante su collar, no identificar personas.
> 
> También mantendríamos la política de que la presencia de una mascota en una imagen no constituye por sí sola una prueba concluyente de que haya sido responsable de un desecho, tal como ya se establece en las consideraciones éticas.

---

## 6. Mecanismo de Heartbeat y Alerta de Batería Baja

Se acepta esta recomendación para mejorar la supervisión del collar y evitar que el sistema deje de detectar una mascota sin que exista una alerta.

El ESP32-C3 podrá medir periódicamente el voltaje de su batería utilizando un ADC y un divisor resistivo, permitiendo obtener una estimación del nivel de batería. Esta información se podrá incluir en la transmisión BLE junto con el identificador del collar.

### Ejemplo de paquete de transmisión:
```yaml
UUID: 001
Battery: 78%
RSSI: -58 dBm
```

El servidor almacenará el momento de la última transmisión recibida para cada collar. Si el nivel de batería se encuentra por debajo de un límite definido, el sistema podrá generar una alerta. De igual manera, si durante un período determinado no se recibe ningún mensaje del collar, se marcará como posiblemente desconectado.

### Implementación propuesta:

```text
ESP32-C3
    ↓
Medición batería
    ↓
BLE Advertising
    ↓
ESP32-CAM
    ↓
Servidor
    ↓
Evaluar batería / Heartbeat
    ↓
¿Problema?
    ↓
Generar alerta
```

> ### Lo que no cambiaríamos:
> No interpretaríamos automáticamente la ausencia de Heartbeat como una batería agotada. La pérdida de comunicación puede deberse a diferentes causas, como que la mascota se encuentre fuera del alcance, que el collar esté apagado o que exista una falla de comunicación.
> 
> Por ello, el sistema mostrará el estado como *"sin comunicación"* y utilizará la información de batería disponible para diferenciar, cuando sea posible, entre batería baja y pérdida de comunicación.
> 
> Tampoco consideramos necesario utilizar una batería de gran capacidad, ya que uno de los objetivos del proyecto es mantener el collar pequeño, ligero y cómodo para la mascota. El uso de BLE y *Deep Sleep* permitirá buscar un equilibrio entre autonomía y frecuencia de detección.

---

## Conclusión de las Modificaciones

Después de analizar las recomendaciones, se implementarán principalmente seis mejoras:

1. **BLE Advertising + Deep Sleep** en el ESP32-C3 para aumentar la autonomía.
2. **RSSI + promedio de lecturas** para mejorar la detección por proximidad.
3. **PIR + BLE + RSSI** como mecanismo combinado de detección.
4. **Buffer Offline mediante micro-SD** para evitar pérdida de evidencia ante fallos de Wi-Fi.
5. **Difuminado de rostros en el servidor** para mejorar la privacidad.
6. **Heartbeat + monitoreo de batería** para supervisar el estado de los collares.

Sin embargo, estas modificaciones no cambiarán la arquitectura fundamental del proyecto. Se mantendrá la **ESP32-C3** como dispositivo del collar y la **ESP32-CAM** como dispositivo residencial, debido a que estas elecciones son coherentes con los requisitos de tamaño, costo, conectividad y funcionalidad definidos originalmente. La ESP32-CAM continuará encargándose de la detección, captura y comunicación con el servidor, mientras que el ESP32-C3 se enfocará principalmente en la identificación BLE y el consumo energético reducido.

Las modificaciones buscan, por tanto, mejorar el diseño existente sin cambiar su objetivo ni reemplazar innecesariamente los componentes principales.
