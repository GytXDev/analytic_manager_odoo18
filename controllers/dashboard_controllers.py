# analytic_manager/controllers/dashboard_controllers.py
from odoo import http
from odoo.http import request, content_disposition

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
    def get_donnees_projets_independantes(self, plan_id=None):
        """
        Retourne la liste des projets avec leurs données indépendantes.
        """
        projects = request.env['analytic.dashboard'].sudo()
        return projects.get_donnees_projets_independantes(plan_id)
    
    @http.route('/dashboard/update_dashboard', type="json", auth="user", website=True)
    def create_dashboard_for_all_analytic_accounts(self):
        """
        Met à jour le tableau de bord en créant les comptes analytiques dans l'enregistrement 'analytic.dashboard'.
        """
        analytic_accounts = request.env['analytic.dashboard'].sudo()
        result = analytic_accounts.create_dashboard_for_all_analytic_accounts()

        # Retourne le résultat avec le nombre de tableaux de bord créés
        return {'status': 'success', 'message': result}
    

    @http.route('/dashboard/liste_plans', type='json', auth='user', website=True)
    def get_plans(self):
        """
        Retourne la liste des plans analytiques.
        """
        plans = request.env['analytic.dashboard'].sudo()
        result = plans.get_all_plans()

        return {'status': 'success', 'data': result}

    # Route pour obtenir les objectifs financier des plans 
    @http.route('/dashboard/get_plan', type='json', auth='user', website=True)
    def dashboard_get_plan(self):
        """
        Retourne les données d'un plan spécifique.
        """
        plan = request.env['dashboard.plan'].sudo()
        if plan:
            result = {'name': plan.name, 'plan': plan.plan}
            return {'status': 'success', 'data': result}
        else:
            return {'status': 'error', 'message': 'Plan non trouvé'} 
    
    
    # Route pour la mise à jour des données d'un projet
    @http.route('/dashboard/update_project', type='json', auth="user", website=True)
    def update_project(self, id, **kwargs):
        """
        Met à jour les données d'un projet spécifique.
        """
        project_model = request.env['analytic.dashboard'].sudo()
        result = project_model.update_project(id, kwargs)
        return result
    
    # Route pour la mise à jour des données d'un projet
    @http.route('/dashboard/get_plan', type='json', auth='user', website=True)
    def dashboard_get_plan(self, plan_name):
        """
        Retourne les données d'un plan spécifique.
        """
        plan = request.env['dashboard.plan'].sudo().search([('name', '=', plan_name)], limit=1)
        if plan:
            result = {'name': plan.name, 'plan': plan.plan}
            return {'status': 'success', 'data': result}
        else:
            return {'status': 'error', 'message': 'Plan non trouvé'}
    
    @http.route('/dashboard/update_all_projects', type='json', auth="user", website=True)
    def update_all_projects(self, **kwargs):
        """
        Met à jour les données de tous les projets.
        """
        project_model = request.env['analytic.dashboard'].sudo()
        result = project_model.update_all_projects(kwargs)
        return result
    
    @http.route('/dashboard/update_plan', type='json', auth="user", website=True)
    def update_plan(self, id, plan):
        """
        Crée un enregistrement dans 'dashboard.plan' avec l'ID et le plan (objectif financier) renseigné par l'utilisateur.
        """
        plan_model = request.env['dashboard.plan'].sudo()
        existing_plan = plan_model.search([('id', '=', id)])
        if existing_plan:
            existing_plan.write({'plan': plan})
            return {'status': 'success', 'message': 'Plan mis à jour avec succès'}
        else:
            # Vérifier s'il existe déjà un plan avec le même nom pour éviter les doublons
            duplicate_plan = plan_model.search([('name', '=', id)])
            if duplicate_plan:
                return {'status': 'error', 'message': 'Un plan avec le même nom existe déjà'}
            else:
                plan_model.create({'name': id, 'plan': plan})
                return {'status': 'success', 'message': 'Plan créé avec succès'}
            
        
    @http.route('/dashboard/export_to_excel', type='http', auth="user", website=True)
    def export_to_excel(self):
        """
        Génère un fichier Excel avec les données des projets et le renvoie en tant que réponse HTTP.
        """
        analytic_dashboard = request.env['analytic.dashboard'].sudo()
        output = analytic_dashboard.export_to_excel()

        filename = 'Resultats_Analytique.xlsx'
        headers = [
            ('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
            ('Content-Disposition', content_disposition(filename))
        ]

        return request.make_response(output, headers)