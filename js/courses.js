/**
 * Courses JavaScript
 * Handles course grid and course-related functionality
 */

// Course colors mapping
const courseColors = {
    '마케팅': '#FF6B6B',
    '기획': '#1A535C',
    '개발': '#4ECDC4',
    '디자인': '#FFE66D',
    '영업실무': '#FF9F1C',
    '인사행정': '#6A0572',
    '스타트업': '#2E2F3E',
    '취업특강': '#E63946',
    '취업': '#E63946',
    '커리어': '#E63946',
    '실무 역량': '#4ECDC4'
};

const categoryToEnglish = {
    '마케팅': 'Marketing',
    '기획': 'Planning',
    '개발': 'Development',
    '디자인': 'Design',
    '영업실무': 'Sales',
    '인사행정': 'HR',
    '스타트업': 'Startup',
    '취업특강': 'Career',
    '취업': 'Career',
    '커리어': 'Career',
    '실무 역량': 'Skills'
};

// Load course grid
function loadCourseGrid() {
    // Use embedded data instead of AJAX to avoid CORS issues
    let courses = typeof COURSES_DATA !== 'undefined' ? COURSES_DATA : [];
    
    // Load registered courses from localStorage (admin에서 등록한 과정)
    try {
        const storedCourses = localStorage.getItem('registeredCourses');
        if (storedCourses) {
            const registeredCourses = JSON.parse(storedCourses);
            // Combine with existing courses
            courses = [...courses, ...registeredCourses];
        }
    } catch (e) {
        console.error('Error loading registered courses:', e);
    }
    
    if (courses.length === 0) {
        // Fallback: try AJAX if embedded data not available
        $.getJSON('../data/courses.json', function(courses) {
            renderCourseGrid(courses);
        }).fail(function() {
            console.error('Failed to load courses data');
            $('#course-grid').html('<p class="text-center">강의 정보를 불러올 수 없습니다.</p>');
        });
    } else {
        renderCourseGrid(courses);
    }
}

// Render course grid
function renderCourseGrid(courses) {
    const gridContainer = $('#course-grid');
    const first8Courses = courses.slice(0, 8);
    
    first8Courses.forEach(function(course, index) {
        const color = courseColors[course.category] || '#2563eb';
        const labelEn = categoryToEnglish[course.category] || 'Course';
        
        const gridItem = createGridItem(course, color, labelEn, index);
        gridContainer.append(gridItem);
    });
    
    // Initialize grid item interactions
    initGridItemInteractions();
    
    // Re-initialize animations after content is loaded
    setTimeout(function() {
        initRevealAnimations();
    }, 100);
}

// Create grid item HTML
function createGridItem(course, color, labelEn, index) {
    const hasSlug = course.slug && course.slug.trim() !== '';
    const $item = $('<div>')
        .addClass('grid-item reveal-up')
        .attr('data-slug', course.slug || course.id || '')
        .attr('data-category', course.category)
        .attr('data-color', color)
        .css('--course-color', color);
    
    const overlay = $('<div>').addClass('grid-item-overlay').css('background-color', color);
    const content = $('<div>').addClass('grid-item-content');
    
    // Display first 3 characters, except HR which shows 2 characters
    let displayText = labelEn;
    if (labelEn === 'HR') {
        displayText = 'HR';
    } else {
        displayText = labelEn.substring(0, 3);
    }
    
    const icon = $('<div>')
        .addClass('grid-item-icon')
        .css('background-color', color)
        .text(displayText);
    
    const title = $('<h3>')
        .addClass('grid-item-title')
        .text(course.title);
    
    const description = $('<p>')
        .addClass('grid-item-description')
        .text(course.shortDescription);
    
    content.append(icon, title, description);
    $item.append(overlay, content);
    
    // Add click handler - Navigate to courses page with course filter (only if slug exists)
    if (hasSlug) {
        $item.on('click', function() {
            // Check if course is registered (from localStorage)
            let isRegistered = false;
            const courseSlug = course.slug || course.id || '';
            try {
                const storedCourses = localStorage.getItem('registeredCourses');
                if (storedCourses) {
                    const registeredCourses = JSON.parse(storedCourses);
                    isRegistered = registeredCourses.some(c => 
                        (c.slug && c.slug === courseSlug) || 
                        (c.id && c.id === courseSlug) ||
                        (c.slug && c.slug === course.slug) ||
                        (c.id && c.id === course.id)
                    );
                }
            } catch (e) {
                console.error('Error checking registered courses:', e);
            }
            
            // Check if we're on index.html (root) or in html folder
            const currentPath = window.location.pathname;
            const href = window.location.href;
            const isRoot = currentPath.endsWith('index.html') || currentPath === '/' || currentPath.endsWith('/') || 
                          (href.includes('file://') && !currentPath.includes('/html/') && !href.includes('/html/'));
            
            let coursesUrl;
            if (isRegistered && courseSlug) {
                // For registered courses, go to template detail page
                if (isRoot) {
                    coursesUrl = 'html/courses/course-detail-template.html?slug=' + courseSlug;
                } else {
                    coursesUrl = 'courses/course-detail-template.html?slug=' + courseSlug;
                }
            } else if (courseSlug) {
                // For existing courses, go to courses page
                if (isRoot) {
                    coursesUrl = 'html/courses.html?course=' + courseSlug;
                } else {
                    coursesUrl = 'courses.html?course=' + courseSlug;
                }
            } else {
                console.warn('No slug found for course:', course);
                return;
            }
            
            window.location.href = coursesUrl;
        });
    } else {
        $item.css('cursor', 'default').attr('title', '상세 페이지가 준비되지 않은 과정입니다.');
    }
    
    return $item;
}

// Initialize grid item interactions
function initGridItemInteractions() {
    // Check if we're on index.html - disable header indicator on index page
    const currentPath = window.location.pathname;
    const href = window.location.href;
    const isIndexPage = currentPath.endsWith('index.html') || currentPath === '/' || currentPath.endsWith('/') || 
                       (href.includes('file://') && (currentPath.endsWith('index.html') || currentPath.endsWith('/') || currentPath === ''));
    
    // Skip header indicator functionality on index.html
    if (isIndexPage) {
        return;
    }
    
    const headerIndicator = $('#header-indicator');
    const indicatorContent = headerIndicator.find('.header-indicator-content');
    
    // Create indicator content if it doesn't exist
    if (indicatorContent.length === 0) {
        headerIndicator.html('<div class="header-indicator-content"></div>');
    }
    
    $('.grid-item').on('mouseenter', function() {
        const $item = $(this);
        const color = $item.data('color');
        const category = $item.data('category');
        
        // Update header indicator
        const $indicator = $('#header-indicator');
        const $indicatorContent = $indicator.find('.header-indicator-content');
        
        $indicatorContent
            .text(category)
            .css({
                'background-color': color,
                'color': '#ffffff'
            });
        
        $indicator.addClass('active');
        
        // Animate indicator
        $indicator.css({
            'opacity': '0',
            'transform': 'translateX(-50%) translateY(-20px)'
        }).animate({
            'opacity': '1',
            'transform': 'translateX(-50%) translateY(0)'
        }, {
            duration: 300,
            easing: 'swing'
        });
    }).on('mouseleave', function() {
        const $indicator = $('#header-indicator');
        $indicator.animate({
            'opacity': '0',
            'transform': 'translateX(-50%) translateY(-20px)'
        }, {
            duration: 200,
            complete: function() {
                $indicator.removeClass('active');
            }
        });
    });
}

// Load course detail
function loadCourseDetail(slug) {
    // Use embedded data instead of AJAX
    const courses = typeof COURSES_DATA !== 'undefined' ? COURSES_DATA : [];
    
    if (courses.length === 0) {
        // Fallback: try AJAX
        $.getJSON('../data/courses.json', function(courses) {
            const course = courses.find(c => c.slug === slug);
            if (course) {
                renderCourseDetail(course);
            } else {
                window.location.href = '../courses.html';
            }
        }).fail(function() {
            console.error('Failed to load course data');
        });
    } else {
        const course = courses.find(c => c.slug === slug);
        if (course) {
            renderCourseDetail(course);
        } else {
            window.location.href = '../courses.html';
        }
    }
}

// Render course detail page
function renderCourseDetail(course) {
    // Update page title
    document.title = course.title + ' | Irum Academy';
    
    // Update hero section if exists
    const heroTitle = $('.page-hero-title');
    if (heroTitle.length) {
        heroTitle.text(course.title);
    }
    
    // Render course content
    // This will be handled in the individual course page HTML
}

// Get course by slug (synchronous version using embedded data)
// Note: courses-data.js also has getCourseBySlug, this is kept for backward compatibility
function getCourseBySlug(slug) {
    // Use embedded data if available
    let courses = typeof COURSES_DATA !== 'undefined' ? COURSES_DATA : [];
    
    // Load registered courses from localStorage (admin에서 등록한 과정)
    try {
        const storedCourses = localStorage.getItem('registeredCourses');
        if (storedCourses) {
            const registeredCourses = JSON.parse(storedCourses);
            // Combine with existing courses
            courses = [...courses, ...registeredCourses];
        }
    } catch (e) {
        console.error('Error loading registered courses:', e);
    }
    
    if (courses.length > 0) {
        return courses.find(c => c.slug === slug);
    }
    // Fallback: return null (caller should handle async loading if needed)
    return null;
}

// Filter courses by category
function filterCoursesByCategory(category) {
    // Use embedded data instead of AJAX
    let courses = typeof COURSES_DATA !== 'undefined' ? COURSES_DATA : [];
    
    // Load registered courses from localStorage (admin에서 등록한 과정)
    try {
        const storedCourses = localStorage.getItem('registeredCourses');
        if (storedCourses) {
            const registeredCourses = JSON.parse(storedCourses);
            // Combine with existing courses
            courses = [...courses, ...registeredCourses];
        }
    } catch (e) {
        console.error('Error loading registered courses:', e);
    }
    
    if (courses.length === 0) {
        // Fallback: try AJAX
        $.getJSON('../data/courses.json', function(courses) {
            const filtered = category ? 
                courses.filter(c => c.category === category) : 
                courses;
            
            renderCourseList(filtered);
        });
    } else {
        const filtered = category ? 
            courses.filter(c => c.category === category) : 
            courses;
        
        renderCourseList(filtered);
    }
}

// Render course list
function renderCourseList(courses, selectedSlug) {
    const container = $('.course-list-container');
    // Remove loading message if exists
    container.find('p').remove();
    container.empty();
    
    courses.forEach(function(course) {
        const color = courseColors[course.category] || '#2563eb';
        const card = createCourseCard(course, color, selectedSlug);
        container.append(card);
    });
    
    // Re-initialize animations
    setTimeout(function() {
        initRevealAnimations();
    }, 100);
}

// Create course card
function createCourseCard(course, color, selectedSlug) {
    // Use slug or id as identifier
    const courseIdentifier = course.slug || course.id || '';
    const hasIdentifier = courseIdentifier.trim() !== '';
    const isSelected = selectedSlug && (course.slug === selectedSlug || course.id === selectedSlug);
    const $card = $('<div>')
        .addClass('card reveal-up')
        .attr('data-slug', courseIdentifier)
        .css({
            'cursor': hasIdentifier ? 'pointer' : 'default',
            'color': '#000000',
            'border': isSelected ? '3px solid var(--primary)' : '1px solid var(--border)',
            'box-shadow': isSelected ? '0 0 20px rgba(37, 99, 235, 0.3)' : 'var(--shadow-md)',
            'opacity': hasIdentifier ? '1' : '0.8'
        });
    
    // Add click handler if identifier exists (slug or id)
    if (hasIdentifier) {
        $card.on('click', function() {
            // Check if course is registered (from localStorage)
            let isRegistered = false;
            const courseIdentifier = course.slug || course.id || '';
            try {
                const storedCourses = localStorage.getItem('registeredCourses');
                if (storedCourses) {
                    const registeredCourses = JSON.parse(storedCourses);
                    isRegistered = registeredCourses.some(c => 
                        (c.slug && c.slug === courseIdentifier) || 
                        (c.id && c.id === courseIdentifier) ||
                        (c.slug && c.slug === course.slug) ||
                        (c.id && c.id === course.id)
                    );
                }
            } catch (e) {
                console.error('Error checking registered courses:', e);
            }
            
            const currentPath = window.location.pathname;
            const isRoot = currentPath.endsWith('index.html') || currentPath === '/' || currentPath.endsWith('/');
            const isInHtml = currentPath.includes('/html/');
            
            let courseUrl;
            // If registered course (has slug or id), use template page
            if (isRegistered && courseIdentifier) {
                // For registered courses, use template page
                const encodedIdentifier = encodeURIComponent(courseIdentifier);
                if (isRoot) {
                    courseUrl = 'html/courses/course-detail-template.html?slug=' + encodedIdentifier;
                } else if (isInHtml) {
                    courseUrl = 'courses/course-detail-template.html?slug=' + encodedIdentifier;
                } else {
                    courseUrl = '../courses/course-detail-template.html?slug=' + encodedIdentifier;
                }
                console.log('Navigating to registered course:', courseUrl, 'isRegistered:', isRegistered);
            } else if (courseIdentifier && course.slug) {
                // For existing courses with slug, use their specific page
                if (isRoot) {
                    courseUrl = 'html/courses/' + course.slug + '.html';
                } else if (isInHtml) {
                    courseUrl = 'courses/' + course.slug + '.html';
                } else {
                    courseUrl = '../courses/' + course.slug + '.html';
                }
            } else if (courseIdentifier) {
                // For registered courses without slug but with id, use template page
                const encodedIdentifier = encodeURIComponent(courseIdentifier);
                if (isRoot) {
                    courseUrl = 'html/courses/course-detail-template.html?slug=' + encodedIdentifier;
                } else if (isInHtml) {
                    courseUrl = 'courses/course-detail-template.html?slug=' + encodedIdentifier;
                } else {
                    courseUrl = '../courses/course-detail-template.html?slug=' + encodedIdentifier;
                }
            } else {
                console.warn('No identifier found for course:', course);
                alert('상세 페이지를 열 수 없습니다. 과정 식별자가 필요합니다.');
                return;
            }
            console.log('Final courseUrl:', courseUrl);
            window.location.href = courseUrl;
        });
    } else {
        // Show tooltip or message for courses without identifier
        $card.attr('title', '상세 페이지를 열 수 없습니다. 과정 식별자가 필요합니다.');
    }
    
    const header = $('<div>').addClass('card-header');
    const badge = $('<span>')
        .addClass('badge')
        .text(course.category);
    
    const title = $('<h3>')
        .addClass('card-title')
        .css('color', '#000000')
        .text(course.title);
    
    const description = $('<p>')
        .addClass('card-description')
        .css('color', '#000000')
        .text(course.shortDescription);
    
    header.append(badge, title, description);
    
    const content = $('<div>').addClass('card-content');
    const meta = $('<div>')
        .addClass('course-meta')
        .css('color', '#000000')
        .html('<span>' + course.durationLabel + '</span><span>•</span><span>' + course.formatLabel + '</span>');
    
    content.append(meta);
    $card.append(header, content);
    
    return $card;
}

