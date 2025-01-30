# analytic_manager/controllers/dashboard_controllers.py
from odoo import http
from odoo.http import request

class DashboardControllers(http.Controller):

    @http.route('/dashboard/resultat_chantier_total', type='json', auth="user", website=True)
    def get_resultat_chantier_total(self, start=None, end=None):
        """
        Calcule et retourne le résultat chantier total de tous les projets
        """
        # Appelez la méthode du modèle avec les filtres de date
        resultat_total = request.env['analytic.dashboard'].sudo()
        return resultat_total.get_resultat_chantier_total(start, end)

    @http.route('/dashboard/progression_moyenne', type='json', auth="user", website=True)
    def get_progression_moyenne(self, start=None, end=None):
        """
        Calcule la progression moyenne des projets
        """
        # Appelez la méthode du modèle avec les filtres de date
        progression_moyenne = request.env['analytic.dashboard'].sudo()
        return progression_moyenne.get_progression_moyenne(start, end)


    @http.route('/dashboard/statistiques_projets', type='json', auth="user", website=True)
    def get_statistiques_projets(self):
        """
        Retourne des statistiques générales sur les projets.
        """
        statistiques = request.env['analytic.dashboard'].sudo()
        return statistiques.get_statistiques_projets()
    
    @http.route('/dashboard/liste_projets', type="json", auth="user", website=True)
    def get_donnees_projets_independantes(self):
        """
        Retourne la liste des projets avec leurs données indépendantes.
        """
        projects = request.env['analytic.dashboard'].sudo()
        return projects.get_donnees_projets_independantes()
    
    @http.route('/dashboard/update_dashboard', type="json", auth="user", website=True)
    def create_dashboard_for_all_analytic_accounts(self):
        """
        Met à jour le tableau de bord en créant les comptes analytiques dans l'enregistrement 'analytic.dashboard'.
        """
        analytic_accounts = request.env['analytic.dashboard'].sudo()
        result = analytic_accounts.create_dashboard_for_all_analytic_accounts()

        # Retourne le résultat avec le nombre de tableaux de bord créés
        return {'status': 'success', 'message': result}