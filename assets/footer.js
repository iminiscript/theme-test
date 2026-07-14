document.addEventListener('DOMContentLoaded', () => {
  // SMS Newsletter Form (US users)
  const smsForm = document.querySelector('#sms-newsletter-form');
  const phoneInput = document.querySelector('#phone-input');

  // Email Newsletter Form (Non-US users)
  const emailForm = document.querySelector('#email-newsletter-form');
  const emailInput = document.querySelector('#email-input');

  // Shared Newsletter Messages
  const newsletterSuccessMessage = document.getElementById('newsletter-success');
  const newsletterErrorMessage = document.getElementById('newsletter-error');
  const newsletterErrorText = document.getElementById('newsletter-error-text');

  // Initialize SMS form if it exists
  if (smsForm && phoneInput) {
    initializeSMSForm();
  }

  // Initialize Email form if it exists
  if (emailForm && emailInput) {
    initializeEmailForm();
  }

  function initializeSMSForm() {
    // Remove any existing onsubmit attributes
    smsForm.removeAttribute('onsubmit');

    // Add phone number formatting
    phoneInput.addEventListener('input', formatPhoneNumber);
    phoneInput.addEventListener('keydown', handlePhoneKeydown);

    // Form submission
    smsForm.addEventListener('submit', handleSMSSubmit);

    // Clear errors on input
    phoneInput.addEventListener('input', clearErrors);
    phoneInput.addEventListener('focus', clearErrors);
  }

  function initializeEmailForm() {
    // Form submission
    emailForm.addEventListener('submit', handleEmailSubmit);

    // Clear errors on input
    emailInput.addEventListener('input', clearErrors);
    emailInput.addEventListener('focus', clearErrors);
  }

  function formatPhoneNumber(event) {
    const input = event.target;
    
    // Get only the digits from the current value
    let value = input.value.replace(/\D/g, '');
    
    // Format progressively - only add formatting when digits are actually present
    let formattedValue = '';
    
    if (value.length === 0) {
      formattedValue = '';
    } else if (value.length <= 3) {
      // (123
      formattedValue = `(${value}`;
    } else if (value.length <= 6) {
      // (123) 456
      formattedValue = `(${value.slice(0, 3)}) ${value.slice(3)}`;
    } else {
      // (123) 456-7890
      formattedValue = `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6, 10)}`;
    }
    
    // Update the input value
    input.value = formattedValue;
  }

  function handlePhoneKeydown(event) {
    // Allow backspace, delete, tab, escape, enter
    if ([8, 9, 27, 13, 46].indexOf(event.keyCode) !== -1 ||
        // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
        (event.keyCode === 65 && event.ctrlKey === true) ||
        (event.keyCode === 67 && event.ctrlKey === true) ||
        (event.keyCode === 86 && event.ctrlKey === true) ||
        (event.keyCode === 88 && event.ctrlKey === true)) {
      return;
    }
    // Ensure that it is a number and stop the keypress
    if ((event.shiftKey || (event.keyCode < 48 || event.keyCode > 57)) && (event.keyCode < 96 || event.keyCode > 105)) {
      event.preventDefault();
    }
  }

  function handleSMSSubmit(event) {
    event.preventDefault();
    
    const phone = phoneInput.value.trim();
    const cleanPhone = phone.replace(/\D/g, '');
    
    if (!phone) {
      showError('Please enter a phone number.');
      return;
    }
    
    if (!validatePhone(cleanPhone)) {
      showError('Please enter a valid 10-digit phone number.');
      return;
    }

    const payload = {
      phone_number: cleanPhone,
      keyword: 'JOINBRUNT',
      origin: 'website',
    };
    
    fetch(smsForm.action, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer sk_22838f9c9a5ce775e910d1d23a8688f4',
        'accept': 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    }).then((res) => {
      if (res.ok) {
        showSuccess("Thanks for subscribing!<br>We'll send you a message shortly.");
      } else {
        throw 'error'
      }
    }).catch(() => {
      showError('Unable to subscribe at this time, try again later.');
    });
  }

  function handleEmailSubmit(event) {
    event.preventDefault();
    
    const email = emailInput.value.trim();
    
    if (!email) {
      showError('Please enter an email address.');
      return;
    }
    
    if (!validateEmail(email)) {
      showError('Please enter a valid email address.');
      return;
    }

    // Show loading state
    const submitBtn = emailForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.innerHTML = 'Signing&nbsp;Up...';
    submitBtn.disabled = true;

    // Submit to Klaviyo
    const formData = new FormData(emailForm);
    
    fetch(emailForm.dataset.ajaxSubmit, {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showSuccess("Thanks for subscribing!<br>We'll send you a message shortly.");
        emailForm.reset();
      } else {
        showError(data.message || 'Something went wrong. Please try again.');
      }
    })
    .catch(error => {
      console.error('Email subscription error:', error);
      showError('Something went wrong. Please try again.');
    })
    .finally(() => {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    });
  }

  function validatePhone(phone) {
    // US phone number validation (10 digits)
    const phoneRegex = /^[2-9]\d{2}[2-9]\d{2}\d{4}$/;
    return phoneRegex.test(phone);
  }

  function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  function showError(message) {
    if (newsletterErrorMessage && newsletterErrorText) {
      newsletterErrorText.textContent = message;
      newsletterErrorMessage.classList.remove('hidden');
      newsletterErrorMessage.classList.add('flex');
      newsletterSuccessMessage.classList.add('hidden');
    }
  }

  function showSuccess(message) {
    if (newsletterSuccessMessage) {
      newsletterSuccessMessage.innerHTML = message;
      newsletterSuccessMessage.classList.remove('hidden');
      newsletterErrorMessage.classList.remove('flex');
      newsletterErrorMessage.classList.add('hidden');
    }
    if (smsForm) smsForm.classList.add('hidden');
    if (emailForm) emailForm.classList.add('hidden');
    clearErrors();
  }

  function clearErrors() {
    if (newsletterErrorMessage) {
      newsletterErrorMessage.classList.add('hidden');
      newsletterErrorMessage.classList.remove('flex');
    }
  }
});