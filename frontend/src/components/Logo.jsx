import React from 'react';

/**
 * Responsive Logo component for MoneySuivi.
 *
 * @param {'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'custom'} size - Size preset
 * @param {boolean} withText - Whether to show the text label alongside the logo
 * @param {string} subtitle - Optional subtitle under the brand name (e.g., 'Finance Tracker')
 * @param {string} className - Additional container classes
 * @param {string} imgClassName - Additional image classes
 * @param {string} textClassName - Additional text classes
 * @param {Function} onClick - Optional click handler
 */
export default function Logo({
  size = 'md',
  withText = false,
  subtitle = null,
  className = '',
  imgClassName = '',
  textClassName = '',
  onClick = null,
}) {
  const sizeMap = {
    xs: { img: 'w-6 h-6 rounded-lg', text: 'text-xs', sub: 'text-[9px]' },
    sm: { img: 'w-7 h-7 sm:w-8 sm:h-8 rounded-lg', text: 'text-sm', sub: 'text-[10px]' },
    md: { img: 'w-9 h-9 sm:w-10 sm:h-10 rounded-xl', text: 'text-base sm:text-lg', sub: 'text-xs' },
    lg: { img: 'w-11 h-11 sm:w-12 sm:h-12 rounded-xl', text: 'text-lg sm:text-xl', sub: 'text-xs' },
    xl: { img: 'w-14 h-14 sm:w-16 sm:h-16 rounded-2xl', text: 'text-xl sm:text-2xl', sub: 'text-sm' },
    custom: { img: '', text: '', sub: '' },
  };

  const selectedSize = sizeMap[size] || sizeMap.md;

  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center gap-2.5 sm:gap-3 select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      <div className="relative flex-shrink-0 flex items-center justify-center">
        <img
          src="/logo.png?v=2"
          alt="MoneySuivi Logo"
          className={`${selectedSize.img} object-contain shadow-md shadow-sky-500/20 transition-transform duration-200 hover:scale-105 ${imgClassName}`}
          loading="eager"
          decoding="async"
        />
      </div>

      {withText && (
        <div className="flex flex-col min-w-0 leading-tight">
          <span className={`font-black tracking-tight dark:text-white text-slate-800 ${selectedSize.text} ${textClassName}`}>
            MoneySuivi
          </span>
          {subtitle && (
            <span className={`dark:text-gray-400 text-gray-500 font-medium ${selectedSize.sub}`}>
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
