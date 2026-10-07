class VisionBoard {
  constructor() {
    this.photos = [];
    this.currentPhotoId = null;
    this.init();
  }

  async init() {
    this.loadPhotos();
    if (this.photos.length === 0) {
      await this.loadPhotoManifest();
    }
    this.setupEventListeners();
    this.render();
  }

  async loadPhotoManifest() {
    try {
      const response = await fetch('photos-manifest.json');
      const photoFiles = await response.json();

      for (const file of photoFiles) {
        const photo = {
          id: Math.random(),
          src: file.path,
          tags: [],
          notes: '',
          uploadedAt: 'Imported'
        };
        this.photos.push(photo);
      }

      this.savePhotos();
    } catch (error) {
      console.error('Failed to load photo manifest:', error);
    }
  }

  setupEventListeners() {
    const fileInput = document.getElementById('photoInput');
    fileInput.addEventListener('change', (e) => this.handlePhotoUpload(e));

    const modal = document.getElementById('photoModal');
    const closeBtn = document.querySelector('.close');
    closeBtn.addEventListener('click', () => this.closeModal());

    document.getElementById('saveBtn').addEventListener('click', () => this.savePhotoDetails());
    document.getElementById('deleteBtn').addEventListener('click', () => this.deletePhoto());

    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeModal();
    });
  }

  handlePhotoUpload(e) {
    const files = Array.from(e.target.files);

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const photo = {
          id: Date.now() + Math.random(),
          src: event.target.result,
          tags: [],
          notes: '',
          uploadedAt: new Date().toLocaleDateString()
        };
        this.photos.unshift(photo);
        this.savePhotos();
        this.render();
      };
      reader.readAsDataURL(file);
    });

    // Reset file input
    e.target.value = '';
  }

  openModal(photoId) {
    this.currentPhotoId = photoId;
    const photo = this.photos.find(p => p.id === photoId);

    if (photo) {
      document.getElementById('modalImage').src = photo.src;
      document.getElementById('tagsInput').value = photo.tags.join(', ');
      document.getElementById('notesInput').value = photo.notes;
      document.getElementById('photoModal').classList.add('show');
    }
  }

  closeModal() {
    document.getElementById('photoModal').classList.remove('show');
    this.currentPhotoId = null;
  }

  savePhotoDetails() {
    if (!this.currentPhotoId) return;

    const photo = this.photos.find(p => p.id === this.currentPhotoId);
    if (photo) {
      const tagsInput = document.getElementById('tagsInput').value;
      photo.tags = tagsInput
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0);

      photo.notes = document.getElementById('notesInput').value;

      this.savePhotos();
      this.render();
      this.closeModal();
    }
  }

  deletePhoto() {
    if (!this.currentPhotoId) return;

    if (confirm('Are you sure you want to delete this photo?')) {
      this.photos = this.photos.filter(p => p.id !== this.currentPhotoId);
      this.savePhotos();
      this.render();
      this.closeModal();
    }
  }

  savePhotos() {
    localStorage.setItem('visionBoard', JSON.stringify(this.photos));
  }

  loadPhotos() {
    const saved = localStorage.getItem('visionBoard');
    this.photos = saved ? JSON.parse(saved) : [];
  }

  render() {
    const grid = document.getElementById('photoGrid');

    if (this.photos.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>No photos yet. Start by uploading some!</p></div>';
      return;
    }

    grid.innerHTML = this.photos
      .map(photo => `
        <div class="photo-card" onclick="visionBoard.openModal(${photo.id})">
          <img src="${photo.src}" alt="Vision board photo">
          <div class="photo-info">
            <div class="photo-tags">
              ${photo.tags.map(tag => `<span class="tag">${this.escapeHtml(tag)}</span>`).join('')}
            </div>
            ${photo.notes ? `<div class="photo-notes">${this.escapeHtml(photo.notes)}</div>` : ''}
          </div>
        </div>
      `)
      .join('');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

const visionBoard = new VisionBoard();
