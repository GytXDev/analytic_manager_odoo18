# __manifest__.py
{
    'name': "Gestion Analytique",
    'summary': "Gestion des résultats analytiques par exploitation",
    'description': """
        Module Odoo pour gérer les résultats analytiques, calculer les totaux par exploitation,
        et fournir des rapports dynamiques.
    """,
    'author': "Ogooué Technologies",
    'website': "https://ogoouetech.com",
    'sequence': -101,
    'category': 'Accounting',
    'version': '1.0',
    'depends': ['base', 'web', 'bus', 'analytic', 'account'],
    'data': [
        'security/ir.model.access.csv',
        'views/analytic_menu.xml',
        'views/dashboard_action.xml',
        'views/analytic_dashboard_views.xml',
        'views/excel_view_action.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',

            'ot_analytic_manager/static/src/js/dashboard.js',
            'ot_analytic_manager/static/src/js/excel_analytic.js',
            'ot_analytic_manager/static/src/xml/dashboard.xml',
            'ot_analytic_manager/static/src/xml/excel_analytic.xml',
            'ot_analytic_manager/static/src/css/material-dashboard.css',
            'ot_analytic_manager/static/src/css/styleswicther.css',
            'ot_analytic_manager/static/src/css/search.css',
            'ot_analytic_manager/static/src/css/excel_css.css',
        ],
    },
    'demo': [
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
    
}