// Lógica completa para el generador de CV - Vanilla JS con validaciones, dinámicos y PDFMake
// Comentarios para mantenimiento: Secciones lógicas para fácil edición
// Dependencias: Bootstrap JS (para accordions/modales), PDFMake (CDN en HTML)

// Constantes y Regex para validaciones argentinas
const REGEX = {
  nombre: /^[a-zA-Z\s]{2,100}$/,
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  telefono: /^(?:(?:00)?549?)?0?(11|[23689]\d)(?:(?=\d{0,2}15)?\d{2})?(\d{4})$/,
  cuil: /^\d{11}$/, // Validación básica; función separada para dígito verificador
  dni: /^\d{7,8}$/,
  fechaNacimiento: /^\d{4}-\d{2}-\d{2}$/ // Formato date input
};

const MAX_HABILIDADES = 5;
const MAX_EXPERIENCIA = 10;
const MAX_FOTO_SIZE = 2 * 1024 * 1024; // 2MB
const STORAGE_KEY = 'cvDraft';
const ENCRYPT_KEY = 'cv2026_key'; // Simple para btoa; en prod usar CryptoJS

// Función principal de inicialización (DOMContentLoaded)
document.addEventListener('DOMContentLoaded', function() {
  // Elementos DOM
  window.form = document.getElementById('cvForm');
  const progressBar = document.querySelector('.progress-bar');
  window.progressText = document.querySelector('small[aria-label="Progreso del formulario"]');
  console.log('progressText resolved:', !!window.progressText); // Log para validar selector
  if (!window.progressText) {
    console.warn('progressText not found - check aria-label in HTML');
  }
  window.consentimiento = document.getElementById('consentimiento');
  window.fotoInput = document.getElementById('fotoPerfil');
  window.previewBtn = document.getElementById('previsualizar');
  window.generarBtn = document.getElementById('generarPDF');
  window.guardarBtn = document.getElementById('guardarBorrador');
  window.previewModal = new bootstrap.Modal(document.getElementById('previewModal'));

  // Inicializar: Cargar borrador si existe
  loadDraft();

  // Eventos para validaciones en tiempo real (blur/change)
  const inputs = window.form.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    input.addEventListener('blur', validateField);
    input.addEventListener('change', validateField);
    if (input.type === 'date' || input.type === 'number') {
      input.addEventListener('input', updateDependentFields); // e.g., edad
    }
  });

  // Foto upload
  window.fotoInput.addEventListener('change', handleFotoUpload);

  // Botones dinámicos
  document.getElementById('addEducacion').addEventListener('click', addEducacionEntry);
  document.getElementById('addExperiencia').addEventListener('click', addExperienciaEntry);
  document.addEventListener('click', e => {
    if (e.target.classList.contains('removeEntry')) {
      e.target.closest('.entry').remove();
      updateProgress();
    }
  });

  // Toggle conducir
  document.getElementById('registroConducir').addEventListener('change', toggleConducirFields);
  console.log('Event listener added to registroConducir'); // Log para validar

  // Botones acción
  window.guardarBtn.addEventListener('click', saveDraft);
  window.previewBtn.addEventListener('click', showPreview);
  window.generarBtn.addEventListener('click', generatePDF);

  // Form submit (para PDF, pero prevenido)
  window.form.addEventListener('submit', e => {
    e.preventDefault();
    if (window.consentimiento.checked) {
      generatePDF();
    } else {
      showAlert('Requiere consentimiento para generar el PDF.', 'warning');
    }
  });

  // Inicial progreso y validaciones
  updateProgress();
  validateAllFields(); // Inicial si hay borrador
});

// Validación individual de campo
function validateField(e) {
  const field = e.target;
  const fieldId = field.id;
  const errorEl = document.getElementById(fieldId + 'Error') || document.getElementById('experienciaError'); // Especial para experiencia
  let isValid = true;
  let errorMsg = '';

  // Regex y reglas específicas
  switch (fieldId) {
    case 'nombre':
      if (!REGEX.nombre.test(field.value)) {
        errorMsg = 'Solo letras y espacios, 2-100 caracteres.';
        isValid = false;
      }
      break;
    case 'domicilio':
      if (field.value.length > 200) {
        errorMsg = 'Máximo 200 caracteres.';
        isValid = false;
      }
      break;
    case 'localidad':
      if (field.value.trim() === '') {
        errorMsg = 'Campo requerido.';
        isValid = false;
      }
      break;
    case 'telefono':
      if (field.value.trim() === '') {
        errorMsg = 'Campo requerido.';
        isValid = false;
      } else if (field.value.replace(/\s-/g, '').length !== 10) {
        errorMsg = 'Debe tener exactamente 10 caracteres.';
        isValid = false;
      }
      break;
    case 'email':
      if (!REGEX.email.test(field.value)) {
        errorMsg = 'Email inválido.';
        isValid = false;
      }
      break;
    case 'fechaNacimiento':
      const birthDate = new Date(field.value);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
      if (age < 18 || age > 100 || field.value === '') {
        errorMsg = 'Debe ser mayor de 18 años y menor de 100.';
        isValid = false;
      } else {
        document.getElementById('edad').value = age;
      }
      break;
    case 'cuil':
      if (!REGEX.cuil.test(field.value)) {
        errorMsg = '11 dígitos exactos.';
        isValid = false;
      } else if (!validateCuil(field.value)) {
        errorMsg = 'CUIL inválido (dígito verificador incorrecto).';
        isValid = false;
      }
      break;
    case 'dni':
      const dniValue = parseInt(field.value);
      if (!REGEX.dni.test(field.value) || dniValue < 1000000 || dniValue > 99999999) {
        errorMsg = '7-8 dígitos, rango realista.';
        isValid = false;
      }
      break;
    case 'habilidades':
      const habs = field.value.split(',').map(h => h.trim()).filter(h => h);
      if (habs.length > MAX_HABILIDADES) {
        errorMsg = `Máximo ${MAX_HABILIDADES} habilidades.`;
        isValid = false;
      }
      break;
    case 'vencimientoLicencia':
      if (document.getElementById('registroConducir').value === 'Sí' && field.value && new Date(field.value) < new Date()) {
        errorMsg = 'Debe ser vigente (fecha futura).';
        isValid = false;
      }
      break;
    default:
      if (field.required && field.value.trim() === '') {
        errorMsg = 'Campo requerido.';
        isValid = false;
      }
      break;
  }

  // Mostrar/ocultar error
  field.classList.toggle('is-invalid', !isValid);
  if (errorEl) {
    errorEl.textContent = errorMsg;
    errorEl.style.display = isValid ? 'none' : 'block';
    errorEl.setAttribute('aria-hidden', isValid);
  }

  // ARIA para accesibilidad
  field.setAttribute('aria-invalid', !isValid);
  field.setAttribute('aria-describedby', isValid ? '' : fieldId + 'Error');

  updateProgress();
}

// Validar CUIL (dígito verificador módulo 10)
function validateCuil(cuil) {
  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cuil[i]) * multipliers[i];
  }
  const verifier = 11 - (sum % 10);
  return parseInt(cuil[10]) === (verifier === 11 ? 0 : verifier === 10 ? 9 : verifier);
}

// Validar todas las secciones para progreso y errores
function validateAllFields() {
  const requiredSections = ['nombre', 'domicilio', 'localidad', 'telefono', 'email', 'estadoCivil', 'fechaNacimiento', 'nacionalidad', 'cuil', 'dni'];
  requiredSections.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) validateField({ target: field });
  });
  // Experiencia opcional - no validar
  document.getElementById('experienciaError').style.display = 'none';
  document.getElementById('experienciaError').setAttribute('aria-hidden', 'true');
  // Educación opcional, validar si hay entradas visibles
  document.querySelectorAll('#educacionEntries .entry:not([style*="display: none"])').forEach(entry => {
    const inputs = entry.querySelectorAll('input[required]');
    inputs.forEach(input => validateField({ target: input }));
  });
}

// Actualizar campos dependientes (e.g., edad)
function updateDependentFields(e) {
  if (e.target.id === 'fechaNacimiento') {
    const birthDate = new Date(e.target.value);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    document.getElementById('edad').value = age;
    validateField(e);
  }
}

// Manejo de foto
function handleFotoUpload(e) {
  const file = e.target.files[0];
  const preview = document.getElementById('fotoPreview');
  const img = preview.querySelector('img');
  if (file) {
    if (file.size > MAX_FOTO_SIZE) {
      showAlert('Foto demasiado grande. Máximo 2MB.', 'danger');
      e.target.value = '';
      return;
    }
    if (!file.type.match(/image\/(jpeg|png)/)) {
      showAlert('Solo JPG o PNG.', 'danger');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = function(ev) {
      img.src = ev.target.result;
      img.alt = 'Foto de perfil subida';
      img.classList.add('border-primary');
      // Guardar base64 para PDF
      window.cvPhotoBase64 = ev.target.result;
    };
    reader.readAsDataURL(file);
  } else {
    img.src = 'https://via.placeholder.com/150x150?text=Tu+Foto';
    img.alt = 'Preview de foto';
    window.cvPhotoBase64 = null;
  }
}

// Agregar entrada educación
function addEducacionEntry() {
  const template = document.querySelector('#educacionEntries .entry').cloneNode(true);
  template.style.display = 'block';
  template.querySelectorAll('input, textarea').forEach(el => el.value = '');
  document.getElementById('educacionEntries').appendChild(template);
  updateProgress();
}

// Agregar entrada experiencia (límite 10)
function addExperienciaEntry() {
  const entries = document.querySelectorAll('#experienciaEntries .entry');
  if (entries.length >= MAX_EXPERIENCIA) {
    showAlert(`Máximo ${MAX_EXPERIENCIA} experiencias.`, 'warning');
    return;
  }
  const template = document.querySelector('#experienciaEntries .entry').cloneNode(true);
  template.style.display = 'block';
  template.querySelectorAll('input, textarea').forEach(el => el.value = '');
  template.querySelector('#actualCheck').checked = false;
  document.getElementById('experienciaEntries').appendChild(template);
  document.getElementById('experienciaError').style.display = 'none';
  updateProgress();
}

// Toggle campos conducir
function toggleConducirFields() {
  const select = document.getElementById('registroConducir');
  const fields = document.getElementById('conducirFields');
  console.log('toggleConducirFields called:', select ? select.value : 'select not found'); // Log para validar
  if (!select) return;
  fields.style.display = select.value === 'Sí' ? 'block' : 'none';
  const vencimiento = document.getElementById('vencimientoLicencia');
  if (select.value === 'Sí') {
    vencimiento.setAttribute('required', 'true');
    if (!vencimiento.hasAttribute('data-validated')) {
      vencimiento.addEventListener('blur', validateField);
      vencimiento.setAttribute('data-validated', 'true');
    }
  } else {
    vencimiento.removeAttribute('required');
  }
}

// Actualizar barra de progreso (basado en secciones completas)
function updateProgress() {
  const sections = 5; // Accordions
  let completed = 0;
  const accordions = document.querySelectorAll('.accordion-collapse');
  accordions.forEach((acc, index) => {
    const body = acc.querySelector('.accordion-body');
    if (body) {
      const required = body.querySelectorAll('[required]');
      let validCount = 0;
      required.forEach(req => {
        if (req.value.trim() !== '' && !req.classList.contains('is-invalid')) validCount++;
      });
      if (validCount === required.length && validCount > 0) completed++;
    }
  });
  // Experiencia opcional - no incrementa
  const percent = (completed / sections) * 100;
  document.querySelector('.progress-bar').style.width = percent + '%';
  document.querySelector('.progress-bar').setAttribute('aria-valuenow', percent);
  if (window.progressText) {
    window.progressText.textContent = `Paso ${completed} de ${sections} completado`;
  }
}

// Guardar borrador (localStorage encriptado básico)
function saveDraft() {
  console.log('saveDraft called, form:', !!window.form); // Log para validar
  if (!window.form) {
    showAlert('Formulario no inicializado. Recarga la página.', 'danger');
    return;
  }
  const formData = new FormData(window.form);
  const data = Object.fromEntries(formData);
  // Agregar dinámicos
  data.educacion = [];
  document.querySelectorAll('#educacionEntries .entry').forEach(entry => {
    const entryData = {
      institucion: entry.querySelector('.institucion').value,
      titulo: entry.querySelector('.titulo').value,
      fechaInicio: entry.querySelector('.fechaInicio').value,
      fechaEgreso: entry.querySelector('.fechaEgreso').value,
      descripcion: entry.querySelector('.descripcion').value
    };
    if (entryData.institucion) data.educacion.push(entryData);
  });
  data.experiencia = [];
  document.querySelectorAll('#experienciaEntries .entry').forEach(entry => {
    const actual = entry.querySelector('#actualCheck').checked;
    const entryData = {
      empresa: entry.querySelector('.empresa').value,
      cargo: entry.querySelector('.cargo').value,
      fechaInicio: entry.querySelector('.fechaInicio').value,
      fechaFin: actual ? null : entry.querySelector('.fechaFin').value,
      descripcion: entry.querySelector('.descripcion').value
    };
    if (entryData.empresa) data.experiencia.push(entryData);
  });
  data.habilidades = document.getElementById('habilidades').value.split(',').map(h => h.trim()).filter(h => h);
  data.fotoBase64 = window.cvPhotoBase64 || null;
  const jsonData = JSON.stringify(data);
  const encrypted = btoa(jsonData + ENCRYPT_KEY); // Encriptación básica
  localStorage.setItem(STORAGE_KEY, encrypted);
  showAlert('Borrador guardado localmente.', 'success');
}

// Cargar borrador
function loadDraft() {
  const encrypted = localStorage.getItem(STORAGE_KEY);
  if (encrypted) {
    try {
      const jsonData = atob(encrypted).replace(ENCRYPT_KEY, '');
      const data = JSON.parse(jsonData);
      // Restaurar campos simples
      Object.keys(data).forEach(key => {
        const el = document.getElementById(key);
        if (el) el.value = data[key] || '';
      });
      // Restaurar dinámicos
      if (data.educacion && data.educacion.length > 0) {
        data.educacion.forEach(() => addEducacionEntry());
        let index = 0;
        document.querySelectorAll('#educacionEntries .entry').forEach(entry => {
          if (index < data.educacion.length) {
            Object.keys(data.educacion[index]).forEach(k => {
              const input = entry.querySelector(`.${k}`);
              if (input) input.value = data.educacion[index][k];
            });
            index++;
          }
        });
      }
      if (data.experiencia && data.experiencia.length > 0) {
        data.experiencia.forEach(() => addExperienciaEntry());
        let index = 0;
        document.querySelectorAll('#experienciaEntries .entry').forEach(entry => {
          if (index < data.experiencia.length) {
            Object.keys(data.experiencia[index]).forEach(k => {
              const input = entry.querySelector(`.${k}`);
              if (input) input.value = data.experiencia[index][k] || '';
            });
            const actualCheck = entry.querySelector('#actualCheck');
            if (actualCheck && !data.experiencia[index].fechaFin) actualCheck.checked = true;
            index++;
          }
        });
      }
      // Foto
      if (data.fotoBase64) {
        const img = document.getElementById('fotoPreview').querySelector('img');
        img.src = data.fotoBase64;
        window.cvPhotoBase64 = data.fotoBase64;
      }
      // Re-validar
      validateAllFields();
      updateProgress();
      showAlert('Borrador cargado.', 'info');
    } catch (e) {
      localStorage.removeItem(STORAGE_KEY);
      showAlert('Error al cargar borrador. Se eliminó.', 'danger');
    }
  }
}

// Previsualizar CV (mockup HTML en modal)
function showPreview() {
  console.log('showPreview called, form:', !!window.form); // Log para validar
  if (!window.form) {
    showAlert('Formulario no inicializado. Recarga la página.', 'danger');
    return;
  }
  if (!window.form.checkValidity()) {
    validateAllFields();
    showAlert('Completa los campos requeridos primero.', 'warning');
    return;
  }
  const data = getFormData();
  let html = `
    <div class="cv-preview" style="font-family: Helvetica, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: white; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
      ${data.objetivo ? `<h2 style="color: #0d6efd; border-bottom: 2px solid #6c757d; padding-bottom: 10px;">Objetivo: ${data.objetivo}</h2>` : ''}
      <div style="display: grid; grid-template-columns: 200px 1fr; gap: 20px;">
        <div style="text-align: center;">
          ${data.fotoBase64 ? `<img src="${data.fotoBase64}" alt="Foto" style="width: 150px; height: 150px; border-radius: 50%; object-fit: cover;">` : '<div style="width: 150px; height: 150px; background: #eee; border-radius: 50%; margin: 0 auto;">Foto</div>'}
          <h3 style="margin-top: 10px; color: #0d6efd;">${data.nombre}</h3>
          <p>${data.email} | ${data.telefono}</p>
          <p>${data.domicilio}, ${data.localidad}</p>
          <p>Edad: ${data.edad} | ${data.estadoCivil} | ${data.nacionalidad}</p>
          <p>DNI: ${data.dni} | CUIL: ${data.cuil}</p>
        </div>
        <div>
          <h3 style="color: #6c757d; border-bottom: 1px solid #dee2e6;">Experiencia Laboral</h3>
          ${data.experiencia.map(exp => `
            <div style="margin-bottom: 15px;">
              <h4 style="color: #0d6efd; margin-bottom: 5px;">${exp.cargo} - ${exp.empresa}</h4>
              <p style="color: #6c757d; margin-bottom: 5px;">${exp.fechaInicio} ${exp.fechaFin ? ` - ${exp.fechaFin}` : '(Actual)'}</p>
              <ul style="margin: 0; padding-left: 20px;">
                ${exp.descripcion.split('\n').filter(d => d.trim()).map(d => `<li>${d}</li>`).join('')}
              </ul>
            </div>
          `).join('')}
          <h3 style="color: #6c757d; border-bottom: 1px solid #dee2e6;">Educación</h3>
          ${data.educacion.map(edu => `
            <div style="margin-bottom: 10px;">
              <h4 style="color: #0d6efd;">${edu.titulo} - ${edu.institucion}</h4>
              <p style="color: #6c757d;">${edu.fechaInicio} - ${edu.fechaEgreso}</p>
              ${edu.descripcion ? `<p>${edu.descripcion}</p>` : ''}
            </div>
          `).join('')}
          <h3 style="color: #6c757d; border-bottom: 1px solid #dee2e6;">Habilidades</h3>
          <ul style="margin: 0; padding-left: 20px;">
            ${data.habilidades.map(h => `<li>${h}</li>`).join('')}
          </ul>
          ${data.registroConducir === 'Sí' ? `
            <h3 style="color: #6c757d;">Otros</h3>
            <p>Registro de Conducir: ${data.tipoLicencia}, Vence: ${data.vencimientoLicencia}</p>
          ` : ''}
        </div>
      </div>
    </div>
  `;
  document.getElementById('previewContent').innerHTML = html;
  previewModal.show();
}

// Obtener datos del formulario (incluyendo dinámicos)
function getFormData() {
  console.log('getFormData called, form:', !!window.form); // Log para validar
  if (!window.form) {
    showAlert('Formulario no inicializado. Recarga la página.', 'danger');
    return {};
  }
  const formData = new FormData(window.form);
  const data = Object.fromEntries(formData);
  data.educacion = [];
  document.querySelectorAll('#educacionEntries .entry').forEach(entry => {
    if (entry.querySelector('.institucion').value.trim()) {
      data.educacion.push({
        institucion: entry.querySelector('.institucion').value,
        titulo: entry.querySelector('.titulo').value,
        fechaInicio: entry.querySelector('.fechaInicio').value,
        fechaEgreso: entry.querySelector('.fechaEgreso').value,
        descripcion: entry.querySelector('.descripcion').value
      });
    }
  });
  data.experiencia = [];
  document.querySelectorAll('#experienciaEntries .entry').forEach((entry, index) => {
    if (entry.querySelector('.empresa').value.trim()) {
      const actual = entry.querySelector('.form-check-input').checked;
      data.experiencia.push({
        empresa: entry.querySelector('.empresa').value,
        cargo: entry.querySelector('.cargo').value,
        fechaInicio: entry.querySelector('.fechaInicio').value,
        fechaFin: actual ? 'Actual' : entry.querySelector('.fechaFin').value,
        descripcion: entry.querySelector('.descripcion').value
      });
    }
  });
  data.habilidades = document.getElementById('habilidades').value.split(',').map(h => h.trim()).filter(h => h);
  // Ordenar experiencia descendente por fecha
  data.experiencia.sort((a, b) => new Date(b.fechaInicio) - new Date(a.fechaInicio));
  // Ordenar educación descendente por egreso
  data.educacion.sort((a, b) => parseInt(b.fechaEgreso) - parseInt(a.fechaEgreso));
  data.fotoBase64 = window.cvPhotoBase64;
  return data;
}
// Obtener campos faltantes requeridos
function getMissingFields() {
  const requiredIds = ['nombre', 'domicilio', 'localidad', 'telefono', 'email', 'estadoCivil', 'fechaNacimiento', 'nacionalidad', 'cuil', 'dni'];
  const missing = [];
  
  // Limpiar clases previas
  document.querySelectorAll('.missing-field').forEach(el => el.classList.remove('missing-field'));
  
  requiredIds.forEach(id => {
    const field = document.getElementById(id);
    if (field && (!field.value || !field.value.trim())) {
      const label = field.previousElementSibling ? field.previousElementSibling.textContent.trim().replace('*', '') : id;
      missing.push(label);
      field.classList.add('missing-field');
      field.classList.add('is-invalid'); // Marcar visualmente
    }
  });
  
  // Experiencia opcional - no verificar
  document.getElementById('experienciaError').style.display = 'none';
  
  return missing;
}

// Generar PDF con PDFMake
function generatePDF() {
  console.log('generatePDF called, form:', !!window.form); // Log para validar
  if (!window.form) {
    showAlert('Formulario no inicializado. Recarga la página.', 'danger');
    return;
  }
  validateAllFields();
  const missing = getMissingFields();
  if (missing.length > 0) {
    const list = missing.map(item => `<li>${item}</li>`).join('');
    const alertMsg = `Faltan completar los siguientes campos obligatorios:<ul style="margin-top: 10px;">${list}</ul>`;
    showAlert(alertMsg, 'warning');
    // Focus en primer faltante si es input
    const firstMissing = document.querySelector('.missing-field');
    if (firstMissing && firstMissing.tagName === 'INPUT') firstMissing.focus();
    return;
  }
  if (!window.consentimiento.checked) {
    showAlert('Debes aceptar el consentimiento para generar el PDF.', 'danger');
    window.consentimiento.focus();
    return;
  }
  const data = getFormData();
  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 60, 40, 40],
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10,
      lineHeight: 1.2,
      color: '#212529'
    },
    styles: {
      header: { fontSize: 18, bold: true, font: 'Roboto', color: '#0d6efd', margin: [0, 0, 0, 10] },
      subheader: { fontSize: 14, bold: true, font: 'Roboto', color: '#6c757d', margin: [0, 10, 0, 5] },
      content: { margin: [0, 0, 0, 5] },
      bullet: { fontSize: 10, margin: [0, 2, 0, 0] }
    },
    layout: {
      hLineColor: function(i, node) { return '#6c757d'; },
      vLineColor: function(i, node) { return '#6c757d'; },
      hLineWidth: function(i, node) { return 0.5; },
      vLineWidth: function(i, node) { return 0.5; },
      paddingLeft: function(i, node) { return 4; },
      paddingRight: function(i, node) { return 4; },
      paddingTop: function(i, node) { return 2; },
      paddingBottom: function(i, node) { return 2; }
    },
    content: [
      // Header superior: Foto a la izquierda, nombre grande en mayúsculas centrado a la derecha
      {
        columns: [
          // Foto a la izquierda (ancho fijo)
          {
            width: '25%',
            stack: [
              data.fotoBase64 ? { image: data.fotoBase64, width: 120, height: 120, alignment: 'center', margin: [0, 0, 0, 20] } : { text: 'Foto', style: 'header', alignment: 'center', margin: [0, 0, 0, 20], fillColor: '#eee' }
            ]
          },
          // Nombre grande en mayúsculas centrado (ocupa el resto)
          {
            width: '*',
            stack: [
              { text: data.nombre.toUpperCase(), font: 'Roboto', fontSize: 48, bold: true, alignment: 'center', margin: [0, 0, 0, 20] }
            ]
          }
        ]
      },
      // Layout principal con columnas: izquierda 40% (datos personales restantes), derecha 60% (contenido)
      {
        columns: [
          // Columna izquierda: 40% - Datos personales restantes
          {
            width: '40%',
            backgroundColor: '#E3F2FD', // Fondo celeste claro para columna izquierda
            stack: [
              // 1. Foto
              data.fotoBase64 ? { image: data.fotoBase64, width: 100, height: 100, alignment: 'center', margin: [0, 0, 0, 10] } : { text: 'Foto', style: 'header', alignment: 'center', margin: [0, 0, 0, 10], fillColor: '#eee' },
              // 2. Emoji email
              { text: '📧', fontSize: 22, alignment: 'center', margin: [0, 0, 0, 2] },
              // 3. Email
              { text: data.email, alignment: 'center', style: 'content', margin: [0, 0, 0, 5] },
              // 4. Emoji teléfono
              { text: '📞', fontSize: 22, alignment: 'center', margin: [0, 0, 0, 2] },
              // 5. Teléfono bold
              { text: data.telefono, alignment: 'center', style: 'content', bold: true, fontSize: 12, margin: [0, 0, 0, 5] },
              // 6. Emoji ubicación
              { text: '📍', fontSize: 22, alignment: 'center', margin: [0, 0, 0, 2] },
              // 7. Dirección completa
              { text: `${data.domicilio}, ${data.localidad}`, alignment: 'center', style: 'content' },
              // Datos adicionales
              { text: `Edad: ${data.edad} | ${data.estadoCivil}`, alignment: 'center', style: 'content', margin: [0, 5, 0, 5] },
              { text: `Nacionalidad: ${data.nacionalidad}`, alignment: 'center', style: 'content', margin: [0, 0, 0, 5] },
              { text: `DNI: ${data.dni} | CUIL: ${data.cuil}`, alignment: 'center', style: 'content' }
            ]
          },
          // Columna derecha: 60% - Contenido principal con fondo temporal celeste claro
          {
            width: '60%',
            backgroundColor: '#E3F2FD', // Celeste claro para la columna derecha
            stack: [
              data.objetivo ? { text: `Objetivo Laboral: ${data.objetivo}`, style: 'subheader', margin: [0, 20, 0, 10] } : '',
              // Experiencia
              { text: 'Experiencia Laboral', style: 'subheader', margin: [0, 0, 0, 10] },
              ...data.experiencia.map(exp => [
                { text: `${exp.cargo} - ${exp.empresa}`, style: 'header', margin: [0, 0, 0, 2] },
                { text: `${exp.fechaInicio} ${exp.fechaFin ? `- ${exp.fechaFin}` : '(Actual)'}`, style: 'content', italics: true, margin: [0, 0, 0, 5] },
                {
                  ul: exp.descripcion.split('\n').filter(d => d.trim()).map(d => [{ text: d.trim(), style: 'bullet' }]),
                  margin: [0, 0, 0, 10]
                }
              ]).flat(),
              // Educación
              { text: 'Educación', style: 'subheader', margin: [0, 0, 0, 10] },
              ...data.educacion.map(edu => [
                { text: `${edu.titulo} - ${edu.institucion}`, style: 'header', margin: [0, 0, 0, 2] },
                { text: `${edu.fechaInicio} - ${edu.fechaEgreso}`, style: 'content', italics: true, margin: [0, 0, 0, 5] },
                edu.descripcion ? { text: edu.descripcion, style: 'content', margin: [0, 2, 0, 10] } : { text: '', margin: [0, 10, 0, 10] }
              ]).flat(),
              // Habilidades
              { text: 'Habilidades', style: 'subheader', margin: [0, 0, 0, 10] },
              {
                ul: data.habilidades.map(h => [{ text: h, style: 'bullet' }]),
                margin: [0, 0, 0, 10]
              },
              // Otros
              data.registroConducir === 'Sí' ? [
                { text: 'Otros', style: 'subheader', margin: [0, 0, 0, 10] },
                { text: `Registro de Conducir: ${data.tipoLicencia}, Vencimiento: ${data.vencimientoLicencia}`, style: 'content' }
              ] : ''
            ]
          }
        ]
      }
    ],
    // Paginación max 2 páginas (PDFMake auto-maneja, pero truncar si >2 no implementado aquí)
    pageBreakBefore: function(currentNode) {
      // Lógica simple para evitar >2 páginas; en prod medir contenido
      return false;
    }
  };

  pdfMake.createPdf(docDefinition).download('CV_Personalizado_2026.pdf');
  showAlert('PDF generado y descargado exitosamente.', 'success');
  // Limpiar localStorage después de generar
  localStorage.removeItem(STORAGE_KEY);
}

// Mostrar alerta accesible
function showAlert(message, type = 'info') {
  const alertDiv = document.createElement('div');
  alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
  alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
  alertDiv.setAttribute('role', 'alert');
  alertDiv.innerHTML = message + `
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  `;
  document.body.appendChild(alertDiv);
  // Auto-remove después de 5s
  setTimeout(() => alertDiv.remove(), 5000);
}



// Inicializar toggle al cargar (llamar directamente)
toggleConducirFields();