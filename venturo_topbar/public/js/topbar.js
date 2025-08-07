// Global variable for navigation data
let navigationData = null;

(function () {
	"use strict";

	function initTopbar() {
		// Check if required objects exist
		if (typeof frappe === "undefined" || !frappe.call) {
			return false;
		}

		// Only run on desk pages
		if (!window.location.pathname.startsWith("/app")) {
			return false;
		}

		loadNavigationData();
		return true;
	}

	function loadNavigationData() {
		// Show loading indicator
		showLoadingTopbar();

		console.log("Attempting to load navigation data...");

		frappe.call({
			method: "venturo_topbar.api.get_navigation_data",
			callback: function (response) {
				console.log("Navigation API response:", response);

				if (response.message) {
					navigationData = response.message;
					console.log("Navigation data loaded successfully:", response.message);
					console.log("Navigation data variable set to:", navigationData);

					hideLoadingTopbar();
					createTopbarNavigation();
				} else {
					console.error("Failed to load navigation data - no message in response");
					console.error("Full response:", response);
					hideLoadingTopbar();
				}
			},
			error: function (error) {
				console.error("Navigation API Error:", error);
				console.error("Error details:", {
					message: error.message,
					status: error.status,
					statusText: error.statusText,
				});
				hideLoadingTopbar();
			},
		});
	}

	function showLoadingTopbar() {
		$(".custom-topbar").remove();
		$("body").prepend(`
            <div class="custom-topbar loading-topbar">
                <div class="topbar-logo">
                    <div class="loading-spinner"></div>
                    <span>Loading...</span>
                </div>
            </div>
        `);
	}

	function hideLoadingTopbar() {
		$(".loading-topbar").remove();
	}

	// Document ready handler
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", function () {
			setTimeout(function () {
				if (!initTopbar()) {
					watchForFrappe();
				}
			}, 1000);
		});
	} else {
		setTimeout(function () {
			if (!initTopbar()) {
				watchForFrappe();
			}
		}, 1000);
	}

	function watchForFrappe() {
		let attempts = 0;
		const maxAttempts = 50;

		const checkFrappe = setInterval(function () {
			attempts++;

			if (initTopbar() || attempts >= maxAttempts) {
				clearInterval(checkFrappe);
				if (attempts >= maxAttempts) {
					console.error("Failed to initialize topbar after maximum attempts");
				}
			}
		}, 100);
	}

	// Watch for route changes
	let currentPath = window.location.pathname;
	setInterval(function () {
		if (window.location.pathname !== currentPath) {
			currentPath = window.location.pathname;
			setTimeout(function () {
				if (window.location.pathname.startsWith("/app") && navigationData) {
					createTopbarNavigation();
				} else if (window.location.pathname.startsWith("/app") && !navigationData) {
					// If we're on an app page but navigationData is not loaded, try to load it
					console.log(
						"Route changed to app page but navigationData not loaded, attempting to load..."
					);
					loadNavigationData();
				}
			}, 500);
		}
	}, 100);

	// Fallback: Try to load navigation data after a longer delay if not loaded
	setTimeout(function () {
		if (!navigationData && window.location.pathname.startsWith("/app")) {
			console.log("Fallback: Attempting to load navigation data after delay...");
			loadNavigationData();
		}
	}, 5000);
})();

function createTopbarNavigation() {
	if (!navigationData) {
		console.warn("Navigation data not available - cannot create topbar");
		return;
	}

	console.log("Creating topbar navigation with data:", navigationData);

	// Remove existing topbar
	$(".custom-topbar").remove();

	// Create topbar HTML
	const topbarHTML = `
        <div class="custom-topbar">
            <div class="topbar-logo">
                ${generateLogo()}
            </div>

            <nav class="topbar-nav">
                ${generateNavItems()}
            </nav>

            <div class="topbar-search">
                ${generateSearchBox()}
            </div>

            <button class="mobile-menu-toggle d-md-none">
                <i class="fa fa-bars"></i>
            </button>

            <div class="topbar-right">
                ${generateUserSection()}
            </div>
        </div>

        <div class="mobile-nav-menu">
            ${generateMobileNavItems()}
        </div>
    `;

	// Insert topbar
	$("body").prepend(topbarHTML);

	// Initialize event handlers
	initializeTopbarEvents();
}

function generateLogo() {
	if (!navigationData || !navigationData.system_settings) {
		return `<span class="app-name">Hayyu</span>`;
	}

	const systemSettings = navigationData.system_settings;
	const appName = systemSettings.app_name || "Hayyu";

	return `<span class="app-name">${appName}</span>`;
}

function generateNavItems() {
	if (!navigationData) {
		console.warn("Navigation data not available for nav items");
		return "";
	}

	const workspaces = navigationData.workspaces || [];

	let navHTML = "";

	// Only use workspaces - ignore modules completely
	if (workspaces.length === 0) {
		console.warn("No workspaces available");
		return "";
	}

	// Workspaces are already filtered in Python API, so use them directly
	navHTML = generateWorkspaceTree(workspaces);

	return navHTML;
}

function generateWorkspaceTree(workspaces) {
	console.log("Generating workspace tree for:", workspaces);

	// Separate parent and child workspaces
	const parentWorkspaces = workspaces.filter((ws) => !ws.parent_page || ws.parent_page === "");
	const childWorkspaces = workspaces.filter((ws) => ws.parent_page && ws.parent_page !== "");

	console.log("Parent workspaces:", parentWorkspaces);
	console.log("Child workspaces:", childWorkspaces);

	// Group children by parent
	const childrenByParent = {};
	childWorkspaces.forEach((child) => {
		if (!childrenByParent[child.parent_page]) {
			childrenByParent[child.parent_page] = [];
		}
		childrenByParent[child.parent_page].push(child);
	});

	console.log("Children grouped by parent:", childrenByParent);

	let navHTML = "";
	let itemCount = 0;
	const maxItems = 8;

	// Generate navigation for parent workspaces
	parentWorkspaces.forEach((parent) => {
		if (itemCount >= maxItems) return;

		const icon = parent.icon || `fa fa-${getDefaultIcon(parent.name)}`;
		const label = parent.title || parent.name;
		const children = childrenByParent[parent.name] || [];

		console.log(`Generating nav item for ${parent.name} with ${children.length} children`);

		navHTML += `
            <div class="topbar-nav-item" data-workspace="${parent.name}">
                <a href="${parent.route}" class="topbar-nav-link">
                    <i class="${icon}"></i>
                    ${label}
                </a>
                ${generateWorkspaceDropdown(parent, children)}
            </div>
        `;

		itemCount++;
	});

	// Add "More" dropdown if there are more parent workspaces
	if (parentWorkspaces.length > maxItems) {
		const remainingParents = parentWorkspaces.slice(maxItems);
		navHTML += `
            <div class="topbar-nav-item">
                <a href="#" class="topbar-nav-link">
                    <i class="fa fa-ellipsis-h"></i>
                    More
                </a>
                <div class="topbar-dropdown">
                    ${generateMoreWorkspaceItems(remainingParents, childrenByParent)}
                </div>
            </div>
        `;
	}

	console.log("Generated workspace tree HTML:", navHTML);
	return navHTML;
}

function generateWorkspaceDropdown(parent, children) {
	if (children.length === 0) {
		return "";
	}

	let dropdownHTML = '<div class="topbar-dropdown">';

	// Add parent workspace link at the top
	dropdownHTML += `
        <a href="${parent.route}" class="topbar-dropdown-item parent-workspace">
            <i class="${parent.icon || `fa fa-${getDefaultIcon(parent.name)}`}"></i>
            ${parent.title || parent.name}
        </a>
        <div class="dropdown-divider"></div>
    `;

	// Add child workspaces
	children.forEach((child) => {
		const icon = child.icon || `fa fa-${getDefaultIcon(child.name)}`;
		dropdownHTML += `
            <a href="${child.route}" class="topbar-dropdown-item">
                <i class="${icon}"></i>
                ${child.title || child.name}
            </a>
        `;
	});

	dropdownHTML += "</div>";
	return dropdownHTML;
}

function generateMoreWorkspaceItems(parents, childrenByParent) {
	let moreHTML = "";

	parents.forEach((parent) => {
		const icon = parent.icon || `fa fa-${getDefaultIcon(parent.name)}`;
		const label = parent.title || parent.name;
		const children = childrenByParent[parent.name] || [];

		moreHTML += `
            <a href="${parent.route}" class="topbar-dropdown-item">
                <i class="${icon}"></i>
                ${label}
            </a>
        `;

		// Add children as sub-items
		children.forEach((child) => {
			const childIcon = child.icon || `fa fa-${getDefaultIcon(child.name)}`;
			moreHTML += `
                <a href="${child.route}" class="topbar-dropdown-item sub-item">
                    <i class="${childIcon}"></i>
                    ${child.title || child.name}
                </a>
            `;
		});
	});

	return moreHTML;
}

function generateDropdown(item) {
	if (!item.doctypes || item.doctypes.length === 0) {
		return "";
	}

	let dropdownHTML = '<div class="topbar-dropdown">';

	// Limit to 10 items per dropdown
	const limitedDoctypes = item.doctypes.slice(0, 10);

	limitedDoctypes.forEach((doctype) => {
		dropdownHTML += `
            <a href="${doctype.route}" class="topbar-dropdown-item">
                <i class="${doctype.icon}"></i>
                ${doctype.label}
            </a>
        `;
	});

	if (item.doctypes.length > 10) {
		dropdownHTML += `
            <a href="${item.route}" class="topbar-dropdown-item view-all">
                <i class="fa fa-arrow-right"></i>
                View All (${item.doctypes.length})
            </a>
        `;
	}

	dropdownHTML += "</div>";
	return dropdownHTML;
}

function generateMoreItems(items) {
	let moreHTML = "";

	items.forEach((item) => {
		const icon = item.icon || `fa fa-${getDefaultIcon(item.name)}`;
		const label = item.title || item.label || item.module_name || item.name;

		moreHTML += `
            <a href="${item.route}" class="topbar-dropdown-item">
                <i class="${icon}"></i>
                ${label}
            </a>
        `;
	});

	return moreHTML;
}

function generateSearchBox() {
	return `
        <div class="topbar-search-container">
            <input type="text" class="topbar-search-input" placeholder="Search..." />
            <i class="fa fa-search topbar-search-icon"></i>
            <div class="topbar-search-results"></div>
        </div>
    `;
}

function generateUserSection() {
	if (!navigationData || !navigationData.user) {
		console.warn("User data not available for user section");
		return "";
	}

	const user = navigationData.user;
	const userImage = user.user_image || "/assets/frappe/images/ui/avatar.png";

	return `
        <div class="topbar-nav-item">
            <a href="#" class="topbar-user">
                <img src="${userImage}" alt="User">
                ${user.full_name}
            </a>
            <div class="topbar-dropdown user-dropdown">
                <a href="/app/user-profile" class="topbar-dropdown-item">
                    <i class="fa fa-user"></i> My Profile
                </a>
                <a href="/app/user-settings" class="topbar-dropdown-item">
                    <i class="fa fa-cog"></i> Settings
                </a>
                <div class="dropdown-divider"></div>
                <a href="/api/method/logout" class="topbar-dropdown-item">
                    <i class="fa fa-sign-out"></i> Logout
                </a>
            </div>
        </div>
    `;
}

function generateMobileNavItems() {
	if (!navigationData) {
		console.warn("Navigation data not available for mobile nav items");
		return "";
	}

	const workspaces = navigationData.workspaces || [];
	let mobileHTML = "";

	if (workspaces.length === 0) {
		console.warn("No workspaces available for mobile navigation");
		return "";
	}

	// Only use workspace tree for mobile
	const parentWorkspaces = workspaces.filter((ws) => !ws.parent_page || ws.parent_page === "");
	const childWorkspaces = workspaces.filter((ws) => ws.parent_page && ws.parent_page !== "");

	// Group children by parent
	const childrenByParent = {};
	childWorkspaces.forEach((child) => {
		if (!childrenByParent[child.parent_page]) {
			childrenByParent[child.parent_page] = [];
		}
		childrenByParent[child.parent_page].push(child);
	});

	// Generate mobile navigation
	parentWorkspaces.forEach((parent) => {
		const icon = parent.icon || `fa fa-${getDefaultIcon(parent.name)}`;
		const label = parent.title || parent.name;
		const children = childrenByParent[parent.name] || [];

		mobileHTML += `
            <div class="mobile-nav-item">
                <a href="${parent.route}" class="mobile-nav-link">
                    <i class="${icon}"></i>
                    ${label}
                </a>
            </div>
        `;

		// Add children as sub-items
		children.forEach((child) => {
			const childIcon = child.icon || `fa fa-${getDefaultIcon(child.name)}`;
			mobileHTML += `
                <div class="mobile-nav-item sub-item">
                    <a href="${child.route}" class="mobile-nav-link">
                        <i class="${childIcon}"></i>
                        ${child.title || child.name}
                    </a>
                </div>
            `;
		});
	});

	return mobileHTML;
}

function getDefaultIcon(moduleName) {
	const icons = {
		Accounts: "money",
		Selling: "tag",
		Buying: "shopping-cart",
		Stock: "cube",
		Manufacturing: "cogs",
		Projects: "tasks",
		"Human Resources": "users",
		Support: "life-ring",
		CRM: "handshake-o",
		Assets: "briefcase",
	};

	return icons[moduleName] || "circle";
}

function initializeTopbarEvents() {
	// Mobile menu toggle
	$(".mobile-menu-toggle").on("click", function () {
		$(".mobile-nav-menu").toggleClass("active");
	});

	// Search functionality
	$(".topbar-search-input").on("input", debounce(handleSearch, 300));

	// Dropdown functionality
	$(".topbar-nav-item").on("mouseenter", function () {
		const $dropdown = $(this).find(".topbar-dropdown");
		if ($dropdown.length > 0) {
			$(".topbar-dropdown").hide();
			$dropdown.show();
		}
	});

	$(".topbar-nav-item").on("mouseleave", function () {
		$(this).find(".topbar-dropdown").hide();
	});

	// Close dropdowns when clicking outside
	$(document).on("click", function (e) {
		if (!$(e.target).closest(".custom-topbar, .mobile-nav-menu").length) {
			$(".mobile-nav-menu").removeClass("active");
			$(".topbar-dropdown").hide();
		}
	});

	// Close dropdowns when clicking on dropdown items
	$(".topbar-dropdown-item").on("click", function () {
		$(".topbar-dropdown").hide();
	});
}

function handleSearch(e) {
	const query = e.target.value.trim();
	const resultsContainer = $(".topbar-search-results");

	if (query.length < 2) {
		resultsContainer.hide();
		return;
	}

	frappe.call({
		method: "venturo_topbar.api.get_quick_search_data",
		args: { query: query },
		callback: function (response) {
			if (response.message) {
				displaySearchResults(response.message, resultsContainer);
			}
		},
		error: function (error) {
			console.error("Search API Error:", error);
		},
	});
}

function displaySearchResults(results, container) {
	let resultsHTML = "";

	results.forEach((result) => {
		resultsHTML += `
            <a href="${result.route}" class="search-result-item">
                <strong>${result.doctype}</strong>
                <span>${result.name}</span>
            </a>
        `;
	});

	container.html(resultsHTML).show();
}

function debounce(func, wait) {
	let timeout;
	return function executedFunction(...args) {
		const later = () => {
			clearTimeout(timeout);
			func(...args);
		};
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
	};
}
