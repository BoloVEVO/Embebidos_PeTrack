# Sistema de Detección de Mascotas por Proximidad para Prevenir Desechos no Deseables en Zonas Residenciales Privadas

**Institución:** Escuela Superior Politécnica del Litoral (ESPOL)  
**Facultad:** Facultad de Ingeniería en Electricidad y Computación (FIEC)  
**Desarrolladores:** 
* Bolívar Holguín Páez
* Joseph Zambrano Caba

---

## 1. Introducción

El presente proyecto consiste en el diseño e implementación de un sistema inteligente para el monitoreo y control de mascotas dentro de una ciudadela privada, con el fin de contribuir a mantener un ambiente más limpio y promover el cumplimiento de las normas de convivencia.

La solución integra tecnologías IoT mediante dispositivos basados en **ESP32-CAM**, comunicación **Bluetooth** y **Wi-Fi**, una base de datos y una plataforma web para registrar y consultar la información generada. Cada mascota portará un collar identificador con un microcontrolador capaz de transmitir periódicamente información sobre la mascota y su propietario. A su vez, cada residencia contará con un dispositivo que detectará las mascotas cercanas, registrará evidencia visual únicamente cuando exista una detección y enviará estos datos a un servidor web.

En caso de que un residente encuentre desechos en su propiedad, podrá consultar los registros recientes y generar un reporte para la administración, facilitando la identificación del posible responsable. Con este proyecto se busca diseñar un sistema capaz de monitorear la presencia de mascotas en las cercanías de las viviendas, almacenar la información en una base de datos y proporcionar una herramienta tecnológica que facilite a la administración de la ciudadela el seguimiento y control del cumplimiento del protocolo de manejo de mascotas.

### Objetivo Principal
Diseñar un dispositivo que permita monitorear a las mascotas que realicen sus desechos cerca de residencias ajenas, con el fin de mejorar el control y la gestión del cumplimiento de las normas establecidas dentro de la ciudadela.

---

## 2. Alcance y Limitaciones

### Problemas que resuelve
El proyecto contempla el diseño e implementación de un sistema de monitoreo de mascotas para uso en ciudadelas privadas, cuyo propósito es facilitar la identificación de mascotas que transiten cerca de residencias y generar evidencia para el reporte de posibles incumplimientos del protocolo de control de mascotas. Para cumplir con esto se busca:

* Diseñar un dispositivo basado en una ESP32-CAM con conectividad Bluetooth y Wi-Fi.
* Detectar automáticamente las mascotas que porten un collar identificador dentro del perímetro de una residencia.
* Recibir y registrar la información enviada por los collares, incluyendo datos de la mascota, su propietario y la residencia a la que pertenece.
* Enviar los datos e imágenes a una base de datos alojada en un servidor web por conexión Wi-Fi.
* Desarrollar una interfaz web para que los residentes puedan consultar los registros recientes y reportar incidentes relacionados con desechos de mascotas.
* Facilitar a la administración de la ciudadela la consulta de la información registrada para aplicar las medidas establecidas en el reglamento interno.

### Problemas que no resuelve (Limitaciones)
El proyecto proporciona una herramienta de apoyo para su monitoreo. Entre sus limitaciones se encuentran:

* No impedirá físicamente que una mascota ingrese a una propiedad privada.
* No garantizará que la mascota detectada sea la responsable del desecho; el sistema únicamente proporcionará evidencia de las mascotas presentes en el área durante un período determinado.
* No detectará mascotas que no utilicen el collar identificador o cuyo dispositivo se encuentre apagado, dañado o sin batería.
* Su funcionamiento dependerá de la cobertura de la red Wi-Fi y del alcance de la comunicación Bluetooth.
* No realizará reconocimiento automático de desechos mediante visión artificial; el reporte será iniciado por el residente.
* No sustituirá la supervisión ni la toma de decisiones por parte de la administración de la ciudadela, sino que proporcionará información para facilitar dichas decisiones.

---

## 3. Diagramas de Bloques y Arquitectura

### 3.1 Diagrama de Bloques - Dispositivo Principal (Residencia)

```text
               +-----------------------+
               | Módulo de carga TP4056 |
               +-----------+-----------+
                           |
                           v
               +-----------------------+
               |     Fuente/Batería    |
               |     (Alimentación)    |
               +-----------+-----------+
                           |
                           v
+------------------+  +---------+  +-------------------+  +--------------------+
| Pulsador de reset|->|         |->| Flash             |  | Dispositivo Collar |
| o flash manual   |  |         |  +-------------------+  | Mascota            |
+------------------+  |         |  +-------------------+  +---------+----------+
                      |         |->| Módulo Bluetooth  |<-----------+
+------------------+  | ESP32-  |  +-------------------+  
| Memoria (SD)     |<-|   CAM   |  +-------------------+  +--------------------+
+------------------+  |         |->| Módulo Wi-Fi      |->| Comunicación       |
                      |         |  +-------------------+  | API REST           |
                      |         |                         +---------+----------+
                      +---------+                                   |
                                                                    v
                                                          +--------------------+
                                                          | Base de Datos      |
                                                          | (Almacenamiento)   |
                                                          +--------------------+
```

### 3.2 Diagrama de Bloques - Dispositivo Collar Mascota

```text
+-----------------------+
| Módulo de carga TP4056|
+-----------+-----------+
            |
            v
+-----------------------+      +-------------------+      +-------------------+
| Fuente / Batería      |----->| ESP32-C3 SuperMini|----->| Flash / Indicador |
| Regulador de voltaje  |      +---------+---------+      +-------------------+
+-----------------------+                |
                                         v
                               +-------------------+      +-------------------+
                               | Módulo Bluetooth  |----->| Dispositivo       |
                               | (BLE)             |      | Principal         |
                               +-------------------+      | (ESP32-CAM)       |
                               +-------------------+      +-------------------+
                               | Pulsador          |
                               +-------------------+
```

---

## 4. Diagrama de Software y Máquina de Estados

### Flujo de Estados del Collar (ESP32-C3):
```text
      [ Inicio ]
          |
          v
[ Inicialización del Sistema ]
  (Bluetooth, Memoria)
          |
          v
[ Transmisión de Señales ]
  (Datos de mascota, residencia, dueño)
          |
          v
[ Confirmación de Señal ]
     /        \
    v          v
[ Error ]   [ Válido ]
```

### Flujo de Estados del Dispositivo Principal (ESP32-CAM):
```text
           [ Inicio ]
               |
               v
  [ Inicializar Bluetooth, Wi-Fi, Memoria ]
               |
               v
     [ Escaneo Bluetooth ]
               |
               v
     ¿Detecta mascota?
       /              \
     (No)             (Sí)
      |                |
      |                v
      |          [ Leer Datos ]
      |                |
      |                v
      |       [ Capturar Evidencia ]
      |                |
      |                v
      |     [ Enviar Datos al Servidor ]
      |                |
      |                v
      |        [ Guardar Registro ]
      |                |
      +-------> [ Reinicio ] <--------+
```

---

## 5. Diseño de Interfaces

### Diagrama de Comunicación entre Componentes
```text
+-------------------------------+
|       COLLAR INTELIGENTE      |
|       ESP32-C3 SuperMini      |
|  - ID Mascota                 |
|  - ID Dueño                   |
|  - Residencia                 |
|  - Bluetooth                  |
+---------------+---------------+
                |
                | (Bluetooth BLE)
                v
+---------------+---------------+
|      DISPOSITIVO PRINCIPAL    |
|           ESP32-CAM           |
|  - Bluetooth                  |
|  - Cámara OV2640              |
|  - Memoria SD                 |
|  - Wi-Fi                      |
+---------------+---------------+
                |
                | (Wi-Fi / HTTP POST)
                v
+---------------+---------------+
|          SERVIDOR WEB         |
|  - API REST                   |
|  - Base de Datos              |
|  - Almacenamiento de Imágenes |
+---------------+---------------+
                |
                v
+---------------+---------------+
|       APLICACIÓN WEB/MÓVIL    |
|   +-----------------------+   |
|   | Residente             |   |
|   | Administración (Staff)|   |
|   +-----------------------+   |
+-------------------------------+
```

### Interfaz de Usuario (Panel Web)
* **Panel del Staff:** Vista administrativa para gestionar usuarios, residencias (ej. Residencia A-12) y consultar reportes emitidos.
* **Módulo de Detecciones:** Tarjetas cronológicas de mascotas detectadas (*Nombre, Dueño, Residencia asociada, Fecha/Hora, Fotografía capturada*).
* **Módulo de Reportes:** Formulario interactivo para seleccionar la evidencia y enviar el reporte formal a la administración.

---

## 6. Alternativas de Diseño

### Comparativa: Dispositivo Principal

| Alternativa | Ventajas | Desventajas |
| :--- | :--- | :--- |
| **ESP32-CAM (Seleccionada)** | Cámara, Wi-Fi y Bluetooth integrados, bajo costo y tamaño compacto. | Menor capacidad de procesamiento que una Raspberry Pi. |
| **Raspberry Pi Zero 2 W** | Mayor potencia de procesamiento. | Mayor consumo eléctrico y costo. |
| **ESP32 convencional + cámara externa y almacenamiento** | Modularidad. | Mayor complejidad de conexiones y mayor tamaño físico. |

*Justificación:* La **ESP32-CAM** fue seleccionada porque integra en un solo módulo la cámara, conectividad Wi-Fi y Bluetooth, reduciendo el costo total del sistema y simplificando su instalación en cada residencia.

### Comparativa: Dispositivo Collar

| Alternativa | Ventajas | Desventajas |
| :--- | :--- | :--- |
| **ESP32-C3 SuperMini (Seleccionada)** | Muy pequeño, Bluetooth BLE, bajo consumo energético. | Menor cantidad de pines disponibles. |
| **ESP32 DevKit** | Mayor capacidad de expansión. | Tamaño excesivo para un collar. |
| **Arduino Nano BLE** | Buena autonomía. | Mayor costo. |

*Justificación:* El **ESP32-C3 SuperMini** ofrece un tamaño reducido y bajo consumo energético, características fundamentales para integrarlo dentro del collar de la mascota sin afectar su comodidad.

---

## 7. Plan de Test y Validación

Para garantizar el correcto funcionamiento del sistema, se realizará un proceso de pruebas para verificar tanto el hardware como el software desarrollado:

1. **Módulo Bluetooth:** Verificar que el dispositivo detecte correctamente los collares identificadores dentro del rango establecido.
2. **Módulo Wi-Fi:** Comprobar la conexión estable con la red y el envío exitoso de información al servidor.
3. **Módulo ESP32-CAM:** Validar la captura de imágenes únicamente cuando se detecte una mascota cercana.
4. **Transmisión de Datos:** Verificar que los collares envíen correctamente los datos en formato JSON cada 5 segundos.
5. **Base de Datos:** Confirmar que los registros se almacenen correctamente y sin pérdida de información.
6. **Página Web:** Validar que los registros, imágenes y opciones de reporte sean visibles y funcionales para el usuario.

### Casos de Prueba Principales:
* **Caso 1:** La mascota ingresa al perímetro de una residencia. El dispositivo detecta el collar mediante Bluetooth. La cámara captura evidencia visual. La información se almacena correctamente en la base de datos. El registro aparece en la página web.
* **Caso 2:** El residente ingresa al sistema web. Consulta los últimos registros. Selecciona el registro correspondiente. Envía el reporte a la administración.
* **Caso 3:** Una mascota permanece fuera del alcance del Bluetooth.
* **Caso 4:** Dos o más mascotas ingresan al área de detección al mismo tiempo; se espera que el sistema registre correctamente la información de cada collar sin mezclar los datos.

---

## 8. Consideraciones Éticas

El sistema recopilará información relacionada con mascotas y sus propietarios, por lo que se debe considerar el uso responsable de los datos y el tratamiento justo de la información:

1. **Protección de la privacidad:**  
   * *Mitigación:* Restringir el acceso únicamente a administradores. Implementar autenticación mediante usuario y contraseña. Almacenar la información utilizando conexiones seguras y bases de datos protegidas.
2. **Uso responsable de las imágenes:**  
   * *Mitigación:* Las imágenes podrían capturar personas u otros elementos ajenos al objetivo del sistema. Se capturarán imágenes únicamente cuando exista una detección de una mascota, utilizándolas exclusivamente como evidencia para la administración. Se definirá un tiempo limitado de almacenamiento con eliminación automática de registros antiguos.
3. **Protección de los datos personales:**  
   * *Mitigación:* Mostrar únicamente la información necesaria para identificar al responsable. Restringir la edición y consulta de datos a usuarios autorizados. Aplicar políticas de confidencialidad y protección de datos.
4. **Evitar sanciones injustas:**  
   * *Mitigación:* La presencia de una mascota cerca de una vivienda no demuestra por sí sola que haya sido la responsable de los desechos. Utilizar los registros como evidencia de apoyo y no como prueba concluyente. Permitir que la administración revise las imágenes y demás evidencias antes de aplicar una sanción.
5. **Bienestar animal:**  
   * *Mitigación:* El collar identificador no debe afectar la salud o comodidad de la mascota. Diseñar un collar ligero, resistente y seguro, utilizando componentes electrónicos de bajo consumo y baja temperatura.
6. **Transparencia del sistema:**  
   * *Mitigación:* Informar claramente el funcionamiento del sistema y el protocolo de monitoreo. Solicitar la aceptación de las normas por parte de los propietarios de mascotas. Explicar el uso que tendrá la información recopilada y quiénes podrán acceder a ella.
