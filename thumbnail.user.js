// ==UserScript==
// @name        whatcd gazelle direct thumbnails
// @include     /https?://www\.empornium\.(me|sx|is)/torrents\.php.*/
// @exclude     /https?://www\.empornium\.(me|sx|is)/torrents\.php\?id.*/
// @include     /https?://www\.empornium\.(me|sx|is)/user\.php.*/
// @include     /https?://femdomcult\.org/torrents\.php.*/
// @exclude     /https?://femdomcult\.org/torrents\.php\?id.*/
// @include     /https?://femdomcult\.org/user\.php.*/
// @include     /https?://www\.cheggit\.me/torrents\.php.*/
// @exclude     /https?://www\.cheggit\.me/torrents\.php\?id.*/
// @include     /https?://www\.cheggit\.me/user\.php.*/
// @include     /https?://pornbay\.org/torrents\.php.*/
// @exclude     /https?://pornbay\.org/torrents\.php\?id.*/
// @include     /https?://pornbay\.org/user\.php.*/
// @version     10
// @require     http://code.jquery.com/jquery-2.1.1.js
// @grant       GM_addStyle
// ==/UserScript==

// Changelog:
// * version 10
// - fixed trimmed category icons on femdomcult
// - added support for top10 on femdomcult
// - excluded torrent details page
// * version 9
// - added support for notifications page
// * version 8
// - fixed undefined variable
// * version 7
// - added support for top10
// - added option full_thumbnails to restore full sized images
// - added option remove_categories, previously it was always set
// * version 6
// - added option small_thumbnails to save bandwidth and decrease imagehosts load
// * version 5
// - added support for femdomcult.org
// * version 4
// - fixed broken option replace_categories
// * version 2
// - improved reliability
// - fixed missing scroll events
// - added option to replace categories

"use strict";

GM_addStyle('' +
'.small-category {' +
// '    text-align: left !important;' +
'    vertical-align: top !important;' +
'}' +
'.overlay-category .cats_col  > div,' +
'.overlay-category .cats_cols > div {' +
'    position: absolute;' +
'    overflow: hidden;' +
'}' +
'.overlay-category-small .cats_col  > div,' +
'.overlay-category-small .cats_cols > div {' +
'    width: 11px;' +
'}' +
'.remove-category .cats_col  > div,' +
'.remove-category .cats_cols > div {' +
'    display: none;' +
'}' +
'');

this.$ = this.jQuery = jQuery.noConflict(true);

function ProgressBar() {
    var self = this;

    this.handle = jQuery('<div>');
    this.bar = jQuery('<div>');
    this.visibility_change_duration = 1; // in seconds
    this.bar_value_change_duration = 0.15; // in seconds

    this.init = function() {
        self.handle.css({
            'background': 'none',
            'width': '100%',
            'height': '4px',
            'position': 'fixed',
            'bottom': '0', // top or bottom
            'left': '0',
            'opacity': '1.0'
        });
        self.bar.css({
            'background': '#2688FF',
            'width': '0%',
            'height': '100%'
        });
        self.bar.appendTo(self.handle);
        self.handle.appendTo('body');

        self.set_visibility_change_duration(self.visibility_change_duration);
        self.set_bar_value_change_duration(self.bar_value_change_duration);
    };

    this.set_visibility_change_duration = function (value) {
        self.visibility_change_duration = value;
        self.handle.css({
            'transition': 'visibility ' + value + 's ease-in ' + value + 's, opacity ' + value + 's ease-in',
            'transition-delay': '0s'
        });
    };

    this.set_bar_value_change_duration = function(value) {
        self.bar_value_change_duration = value;
        self.bar.css({'transition': 'width ' + value + 's linear'});
    };

    this.set_value = function(value) {
        self.bar.css({'width': value * 100 + '%'});
    };

    this.show = function() {
        self.handle.css({
            'visibility': 'visible',
            'opacity': '1.0'
        });
    };

    this.hide = function() {
        self.handle.css({
            'visibility': 'hidden',
            'opacity': '0.0'
        });
    };

    this.init();
}

function get_$category($row) {
    if (window.location.href.indexOf("collages.php") > -1)
        return jQuery('td:first-child', $row);
    else
        return jQuery('td.cats_col, td.cats_cols', $row);
}

function get_$title($row) {
    if (window.location.href.indexOf("collages.php") > -1)
        return jQuery('td:nth-child(2)', $row);
    else
        return jQuery('td.cats_col + td, td.cats_cols + td', $row);
}

function disable_images(html) {
    // replace src inside img node with data-src
    // to prevent preloading all images by browser
    return html.replace(/ src=/g, ' data-src=');
}

function ImagesFromHover(replace_categories) {
    this.get_image_src = function ($row) {
        var script = jQuery('script', $row).text().trim();
        var matches = script.match(/^var.*?= ?(.*)$/);
        if (matches.length == 2) {
            var hover_html = eval(matches[1]);
            var safe_html = disable_images(hover_html);
            return jQuery('img', safe_html).data('src');
        }
    };

    this.attach_image = function ($row, $img) {
        if (replace_categories) {
            var $category = get_$category($row);
            $category.append($img);
        }
        else {
            var $title = get_$title($row);

            $img.css({
                'float': 'left',
                'margin-right': '7px'
            });
            $title.prepend($img);
        }
    };
}

function LazyThumbnails(progress, backend, small_thumbnails, full_thumbnails, replace_categories, remove_categories) {
    var self = this;

    this.$torrent_table = null;
    this.images = []
    this.attach_image = backend.attach_image;
    this.get_image_src = backend.get_image_src;
    this.image_index = 0;
    this.preload_ratio = 0.8;

    this.friendly_hosts = [
        {
            pattern: /https?:\/\/(jerking|fapping|cache)\.empornium\.(ph|sx).*/,
            replace_to_small: [/(?:\.(?:th|md))?\.([^.]+)$/, '.th.$1'],
            replace_to_full: [/(?:\.(?:th|md))?\.([^.]+)$/, '.$1']
        },
    ];

    this.create_img = function(src, small) {
        var $img = jQuery('<img>');
        var min_size = small ? '150px' : '150px';
        $img.data('src', src);
        $img.attr('src', src);
        //console.log($img.attr('src'));
        $img.css({
            'min-width': min_size,
            'min-height': '50px',
            'max-width': '250px',
            'max-height': '350px',
        });
        return $img;
    };

    this.show_img = function ($img) {
        var src = $img.data('src');
        $img.prop('src', $img.data('src'));
        $img.css({
            'min-width': '',
            'min-height': ''
        });
    };

    this.fix_title = function ($row) {
        var $title = get_$title($row);
        $title.css({
            'vertical-align': 'top'
        });
    };

    this.thumbnalize = function (src, to_full) {
        for (var i = 0; i < self.friendly_hosts.length; i++) {
            var item = self.friendly_hosts[i];
            if (item.pattern.test(src)) {
                var replace_pattern = to_full ? item.replace_to_full : item.replace_to_small;
                return String.prototype.replace.apply(src, replace_pattern);
            }
        }
    }

    this.attach_thumbnails = function () {
        self.$torrent_table.find('tr.torrent').each(function() {
            var $row = jQuery(this);

            var src = self.get_image_src($row);
            if (src === undefined) {
                // to hide categories if cover not exist
                // when replace_categories is set
                src = '/static/common/noartwork/noimage.png';
            }

            var small = false;
            if (src && (small_thumbnails || full_thumbnails)) {
                var to_full = full_thumbnails && !small_thumbnails;
                var new_src = self.thumbnalize(src, to_full);
                if (new_src) {
                    src = new_src;
                    small = true;
                }
            }

            var $img = self.create_img(src, small);
            self.images.push($img);
            self.attach_image($row, $img);
            self.fix_title($row);
        });
    };

    this.visible_area = function() {
        var $window = jQuery(window);
        var y = $window.scrollTop();
        var height = $window.height();
        return [y, height];
    };

    this.on_scroll_event = function() {
        self.load_next_image();
    };

    this.load_next_image = function(force_check) {
        // console.log('load next image', self.image_index, '/', self.images.length);
        if (self.image_index < self.images.length) {
            var $img = self.images[self.image_index];
            var _ = self.visible_area(),
                y = _[0],
                height = _[1];

            var bottom_limit = y + height * (1 + self.preload_ratio);
            if (bottom_limit >= $img.position().top) {
                self.show_img($img);
                self.image_index += 1;
                self.progress_set_value(self.image_index / self.images.length);
                self.load_next_image(true);
            }
            else if (force_check)
                setTimeout(self.load_next_image, 0);
        }
        else {
            self.detach_scroll_event();
        }
    };

    this.progress_set_value = function(value) {
        progress && progress.set_value(value);
    };

    this.progress_hide = function() {
        progress && progress.hide();
    };

    this.attach_scroll_event = function() {
        jQuery(document).on('scroll resize', self.on_scroll_event);
    };
    this.detach_scroll_event = function() {
        jQuery(document).off('scroll resize', self.on_scroll_event);
        self.progress_hide();
    };

    this.replace_categories = function () {
        if (window.location.hostname.indexOf('empornium') !== -1)
            self.$torrent_table.addClass('overlay-category-small');
        self.$torrent_table.addClass('overlay-category');
    };

    this.remove_categories = function () {
        self.$torrent_table.addClass('remove-category');
    };

    this.init = function() {
        self.$torrent_table = jQuery('.torrent_table');
        if (replace_categories)
            self.replace_categories();
        if (remove_categories)
            self.remove_categories();

        self.attach_thumbnails();
        self.load_next_image();
        self.attach_scroll_event();
    };

    this.init();
}

function create_backend(replace_categories) {
    return new ImagesFromHover(replace_categories);
}

(function() {
    var replace_categories = false;
    var remove_categories = false;
    var small_thumbnails = false;

    var backend = create_backend(replace_categories);
    new LazyThumbnails(
        new ProgressBar(),
        backend,
        small_thumbnails,
        false,
        replace_categories,
        remove_categories
    );
})();
