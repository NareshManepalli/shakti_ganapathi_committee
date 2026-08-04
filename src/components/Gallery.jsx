import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { translations } from '../utils/translations';
import './Gallery.css';

const Gallery = () => {
  const { language } = useLanguage();
  const t = translations[language];
  
  // Get current year and previous year
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;
  
  // Generate years array (current year and 5 years back)
  const years = Array.from({ length: 6 }, (_, i) => currentYear - i);
  
  const [selectedYear, setSelectedYear] = useState(previousYear);
  const [showAll, setShowAll] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  
  // Generate dummy images for all years using placeholder service
  const generateGalleryImages = () => {
    const images = [];
    years.forEach((year, yearIndex) => {
      // Previous year has 12 images
      if (year === previousYear) {
        for (let i = 1; i <= 12; i++) {
          images.push({
            id: `${year}-${i}`,
            year: year,
            url: `https://picsum.photos/400/400?random=${year}${i}`
          });
        }
      }
      // Current year has 6 images
      else if (year === currentYear) {
        for (let i = 1; i <= 6; i++) {
          images.push({
            id: `${year}-${i}`,
            year: year,
            url: `https://picsum.photos/400/400?random=${year}${i}`
          });
        }
      }
      // 2 years ago has 8 images
      else if (year === currentYear - 2) {
        for (let i = 1; i <= 8; i++) {
          images.push({
            id: `${year}-${i}`,
            year: year,
            url: `https://picsum.photos/400/400?random=${year}${i}`
          });
        }
      }
      // 3 years ago has 4 images
      else if (year === currentYear - 3) {
        for (let i = 1; i <= 4; i++) {
          images.push({
            id: `${year}-${i}`,
            year: year,
            url: `https://picsum.photos/400/400?random=${year}${i}`
          });
        }
      }
      // Other years have no images (will show "no images available")
    });
    return images;
  };

  const galleryImages = generateGalleryImages();
  const filteredImages = galleryImages.filter(img => img.year === selectedYear);
  const displayedImages = showAll ? filteredImages : filteredImages.slice(0, 6);
  const hasMoreImages = filteredImages.length > 6;

  // Reset showAll when year changes
  useEffect(() => {
    setShowAll(false);
    setSelectedImage(null);
  }, [selectedYear]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (selectedImage !== null) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [selectedImage]);

  const openImagePreview = (image) => {
    setSelectedImage(image);
  };

  const closeImagePreview = () => {
    setSelectedImage(null);
  };

  const navigateImage = (direction) => {
    const currentIndex = filteredImages.findIndex(img => img.id === selectedImage.id);
    let newIndex;
    if (direction === 'next') {
      newIndex = (currentIndex + 1) % filteredImages.length;
    } else {
      newIndex = currentIndex - 1;
      if (newIndex < 0) newIndex = filteredImages.length - 1;
    }
    setSelectedImage(filteredImages[newIndex]);
  };

  return (
    <>
      <section id="gallery" className="gallery-section">
        <div className="gallery-container">
          <h2 className="gallery-title">{t.galleryTitle}</h2>
          <p className="gallery-subtitle">{t.gallerySubtitle}</p>
          
          <div className="year-selector-wrapper">
            <div className="year-selector">
              <label htmlFor="year-select" className="year-label">{t.selectYear}:</label>
              <select 
                id="year-select"
                className="year-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              >
                {years.map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="gallery-grid">
            {filteredImages.length > 0 ? (
              displayedImages.map((image) => (
                <div 
                  key={image.id} 
                  className="gallery-item"
                  onClick={() => openImagePreview(image)}
                >
                  <img 
                    src={image.url} 
                    alt={`Gallery ${image.id}`}
                    className="gallery-image"
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextElementSibling.style.display = 'flex';
                    }}
                  />
                  <div className="gallery-placeholder">
                    <span className="placeholder-text">📷</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-images">
                <p>{t.noImagesAvailable}</p>
              </div>
            )}
          </div>

          {hasMoreImages && (
            <div className="show-more-wrapper">
              <button 
                className="show-more-btn"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? t.showLess : t.showMore}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Image Preview Modal */}
      {selectedImage && (
        <div className="image-preview-modal" onClick={closeImagePreview}>
          <button className="preview-close-btn" onClick={closeImagePreview}>×</button>
          <button 
            className="preview-nav-btn preview-prev"
            onClick={(e) => {
              e.stopPropagation();
              navigateImage('prev');
            }}
          >
            ‹
          </button>
          <div className="preview-image-wrapper" onClick={(e) => e.stopPropagation()}>
            <img 
              src={selectedImage.url} 
              alt={`Preview ${selectedImage.id}`}
              className="preview-image"
              onError={(e) => {
                e.target.style.display = 'none';
                e.target.nextElementSibling.style.display = 'flex';
              }}
            />
            <div className="preview-placeholder">
              <span className="placeholder-text-large">📷</span>
            </div>
          </div>
          <button 
            className="preview-nav-btn preview-next"
            onClick={(e) => {
              e.stopPropagation();
              navigateImage('next');
            }}
          >
            ›
          </button>
        </div>
      )}
    </>
  );
};

export default Gallery;
