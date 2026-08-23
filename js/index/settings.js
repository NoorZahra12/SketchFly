const FONT_SIZES = {
	small: '14px',
	medium: '16px',
	large: '20px',
	'extra-large': '24px'
};

export function applyStoredSettings() {
	const theme = localStorage.getItem('theme');
	document.body.classList.toggle('dark', theme === 'dark');
	applyFontSize(localStorage.getItem('fontSize') || 'medium');
}

export function attachSettingsFunctions() {
	applyStoredSettings();
	const fontSizeSelect = document.querySelector('#font-size-select');
	const toggleButton = document.querySelector('.toggle');

	if (fontSizeSelect) {
		fontSizeSelect.value = localStorage.getItem('fontSize') || 'medium';
		fontSizeSelect.addEventListener('change', event => applyFontSize(event.target.value));
	}

	if (toggleButton) {
		toggleButton.setAttribute('aria-checked', String(document.body.classList.contains('dark')));
		toggleButton.addEventListener('click', () => {
			const dark = document.body.classList.toggle('dark');
			localStorage.setItem('theme', dark ? 'dark' : 'light');
			toggleButton.setAttribute('aria-checked', String(dark));
		});
	}
}

export function applyFontSize(size) {
	const selectedSize = FONT_SIZES[size] ? size : 'medium';
	document.documentElement.style.setProperty('--app-font-size', FONT_SIZES[selectedSize]);
	localStorage.setItem('fontSize', selectedSize);
	const select = document.querySelector('#font-size-select');
	if (select) select.value = selectedSize;
}
