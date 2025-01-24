# controllers/dashboard_controllers.py
from odoo import http
from odoo.http import request

class DashboardControllers(http.Controller):

    @http.route('/dashboard/resultat_chantier_total', type='json', auth="public", website=True)
    def get_resultat_chantier_total(self):
        """
        Calcule et retourne le résultat chantier total de tous les projets
        """
        resultat_total = request.env['analytic.dashboard'].sudo()
        return resultat_total.get_resultat_chantier_total()

    @http.route('/dashboard/progression_moyenne', type='json', auth="public", website=True)
    def get_progression_moyenne(self):
        """
        Calcule la progression moyenne des projets
        """
        progression_moyenne = request.env['analytic.dashboard'].sudo()
        return progression_moyenne.get_progression_moyenne()


    @http.route('/dashboard/statistiques_projets', type='json', auth="public", website=True)
    def get_statistiques_projets(self):
        """
        Retourne des statistiques générales sur les projets.
        """
        statistiques = request.env['analytic.dashboard'].sudo()
        return statistiques.get_statistiques_projets()
    
    @http.route('/dashboard/liste_projets', type="json", auth="public", website=True)
    def get_donnees_projets_independantes(self):
        """
        Retourne la liste des projets avec leurs données indépendantes.
        """
        projects = request.env['analytic.dashboard'].sudo()
        return projects.get_donnees_projets_independantes()